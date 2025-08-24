// src/controllers/webhook.controller.ts
import { Router, json } from 'express';
import { cfg } from '../config';
import { BOT_ID, MENTIONS_MARKUP_REGEX } from '../constants';
import {
  extractCommandText,
  findCommand,
  helpMessage,
  postText,
} from '../webhookUtils';
import { indexIncoming, maybeAutoReply } from '../autoanswer/engine';

export const webhookRouter = Router();

/* -------------------------------------------------------------------------- */
/* De-dupe: avoid replying twice to the same post ID                          */
/* -------------------------------------------------------------------------- */
const SEEN = new Map<string, number>();
const SEEN_TTL_MS = 60_000; // keep seen IDs for 60s

function seenRecently(id: string): boolean {
  const now = Date.now();
  // cleanup old
  for (const [k, ts] of SEEN) {
    if (now - ts > SEEN_TTL_MS) SEEN.delete(k);
  }
  if (!id) return false;
  if (SEEN.has(id)) return true;
  SEEN.set(id, now);
  return false;
}

/* -------------------------------------------------------------------------- */
/* Types & helpers                                                            */
/* -------------------------------------------------------------------------- */

type AnyRecord = Record<string, any>;

type NormalizedPost = {
  id: string;
  groupId: string;
  chatType: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  parentId?: string;
  mentions: any[];
  rawText: string;
  cleanText: string;
};

function isTeamMessagingPostEvent(body: AnyRecord): boolean {
  const envelopeEvent = String(body?.event || body?.body?.event || '');
  const eventType = String(
    body?.eventType || body?.body?.eventType || '',
  ).toLowerCase();
  const hasPostNode = !!body?.post || !!body?.message;
  const hasPostPath = envelopeEvent.includes('/team-messaging/v1/posts');

  // If RingCentral tells us the event type, only process postadded
  if (eventType) return eventType === 'postadded';

  // Otherwise fall back to presence of a post node/path
  return hasPostNode || hasPostPath;
}

function pickPostNode(body: AnyRecord): AnyRecord {
  return body?.post || body?.message || body || {};
}

function normalizePost(raw: AnyRecord): NormalizedPost {
  const post = pickPostNode(raw);

  const id = String(post?.id ?? raw?.id ?? '');
  const groupId = String(post?.groupId ?? raw?.groupId ?? raw?.chatId ?? '');
  const creator = post?.creator || raw?.creator || {};
  const creatorId = String(creator?.id || '');
  const creatorName = String(creator?.name || 'friend');
  const createdAt = Date.parse(
    String(post?.creationTime || raw?.creationTime || new Date().toISOString()),
  );

  const parentId: string | undefined =
    post?.parentId ||
    post?.rootId ||
    post?.topicId ||
    post?.quoteOfId ||
    undefined;

  const chatType = String(
    post?.group?.type ||
      raw?.group?.type ||
      raw?.chat?.type ||
      raw?.groupType ||
      '',
  );

  const mentions: any[] =
    (Array.isArray(post?.mentions) && post.mentions) ||
    (Array.isArray(raw?.post?.mentions) && raw.post.mentions) ||
    (Array.isArray(raw?.message?.mentions) && raw.message.mentions) ||
    (Array.isArray(raw?.mentions) && raw.mentions) ||
    [];

  const rawText = String(post?.text || raw?.text || '');
  const cleanText = rawText.replace(MENTIONS_MARKUP_REGEX, '').trim();

  return {
    id,
    groupId,
    chatType,
    creatorId,
    creatorName,
    createdAt,
    parentId,
    mentions,
    rawText,
    cleanText,
  };
}

/** Was the bot addressed? (DM, explicit mention entity, or name match) */
function wasBotMentioned(n: NormalizedPost): boolean {
  const isDirect = n.chatType === 'Direct';
  if (isDirect) return true;

  const mentionedById = n.mentions.some((m: any) => String(m?.id) === BOT_ID);
  const nameMention = new RegExp(`\\b${cfg.BOT_NAME}\\b`, 'i').test(
    n.cleanText,
  );
  return mentionedById || nameMention;
}

/** Index into history store */
async function indexMessage(n: NormalizedPost) {
  if (!n.cleanText) return;
  await indexIncoming({
    id: n.id,
    chatId: n.groupId,
    authorId: n.creatorId,
    authorName: n.creatorName,
    createdAt: n.createdAt,
    text: n.cleanText,
    parentId: n.parentId,
  });
}

/** Auto-answer (non-DM & not mentioned) */
async function tryAutoAnswer(n: NormalizedPost) {
  if (!n.cleanText) return;
  if (n.chatType === 'Direct') return;
  await maybeAutoReply(
    {
      id: n.id,
      chatId: n.groupId,
      authorId: n.creatorId,
      authorName: n.creatorName,
      createdAt: n.createdAt,
      text: n.cleanText,
      parentId: n.parentId,
    },
    (text: string) => postText(n.groupId as any, text),
  );
}

/** Handle the “mentioned/DM → commands only” branch */
async function handleCommands(n: NormalizedPost) {
  const cmdText = extractCommandText(n.cleanText);
  const args = cmdText.split(/\s+/).filter(Boolean);

  // Pure ping → help and return
  if (args.length === 0) {
    await postText(n.groupId as any, helpMessage());
    return;
  }

  const ctx: any = {
    text: n.cleanText,
    cleanText: cmdText,
    args,
    chatId: n.groupId,
    chatType: n.chatType,
    creatorId: n.creatorId,
    creatorName: n.creatorName,
    parentPostId: n.parentId,
    reply: (text: string, extra?: any) =>
      postText(n.groupId as any, text, extra),
  };

  const cmd = findCommand(cmdText.toLowerCase(), ctx);
  if (!cmd) {
    await postText(n.groupId as any, helpMessage());
    return;
  }

  try {
    await Promise.resolve(cmd.run(ctx));
  } catch (err: any) {
    console.error('command error:', err);
    await postText(
      n.groupId as any,
      `Whoops, that command hiccuped: ${err?.message || 'error'}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

webhookRouter.post('/', json(), async (req, res) => {
  // Subscription API handshake (not used when using Console "Enable bot webhooks")
  const validation = req.get('Validation-Token');
  if (validation) {
    res.set('Validation-Token', validation);
    return res.status(200).end();
  }

  // Console verification
  const vt = req.get('Verification-Token');
  if (process.env.VERIFICATION_TOKEN && vt !== process.env.VERIFICATION_TOKEN) {
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }

  // Ack early so RC doesn't retry
  res.status(200).end();

  try {
    const body: AnyRecord = (req.body && (req.body.body || req.body)) || {};
    if (!isTeamMessagingPostEvent(body)) return;

    const post = normalizePost(body);

    // Prevent double-processing: sometimes RC sends more than one event per message
    if (seenRecently(post.id)) return;

    // Ignore our own messages
    if (post.creatorId === BOT_ID) return;

    // Always index first
    await indexMessage(post);

    if (wasBotMentioned(post)) {
      // Mentioned or DM → commands only (no auto-answer)
      await handleCommands(post);
      return; // IMPORTANT
    }

    // Not mentioned → auto-answer only
    await tryAutoAnswer(post);
  } catch (e) {
    console.error('webhook controller error:', e);
  }
});
