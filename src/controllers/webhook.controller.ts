import { Router, json } from 'express';
import { BOT_ID, MENTIONS_MARKUP_REGEX, QUESTION_REGEX } from '../constants';
import {
  extractCommandText,
  findCommand,
  helpMessage,
  postText,
} from '../utils/webhookUtils';
import { indexIncoming, maybeAutoReply } from '../autoanswer/engine';
import { APP_CONFIG } from '../config';
import { stripQuotedText } from '../utils/generalUtils';
import { resolveDisplayName } from '../services/names.service';

export const webhookRouter = Router();

webhookRouter.post('/', json(), async (req, res) => {
  // Subscription API handshake (not used if you set webhooks in console)
  const validation = req.get('Validation-Token');
  if (validation) {
    res.set('Validation-Token', validation);
    return res.status(200).end();
  }

  // Console “Enable bot webhooks” verification
  const vt = req.get('Verification-Token');
  if (APP_CONFIG.VERIFICATION_TOKEN && vt !== APP_CONFIG.VERIFICATION_TOKEN) {
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }

  res.status(200).end();

  try {
    const body: AnyRecord = (req.body && (req.body.body || req.body)) || {};
    if (!isTeamMessagingPostEvent(body)) return;
    const post = await normalizePost(body);
    if (post.creatorId === BOT_ID) return; // ignore bot's own messages

    await indexMessage(post);
    if (wasBotMentioned(post)) {
      await handleCommands(post);
      return;
    }
    await tryAutoAnswer(post);
  } catch (e) {
    console.error('webhook controller error:', e);
  }
});

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
  hasQuote: boolean;
  textNoQuotes: string;
};

function isTeamMessagingPostEvent(body: AnyRecord): boolean {
  const envelopeEvent = String(body?.event || body?.body?.event || '');
  const eventType = String(
    body?.eventType || body?.body?.eventType || '',
  ).toLowerCase();

  return (
    envelopeEvent.includes('/team-messaging/v1/posts') ||
    eventType === 'postadded' ||
    eventType === 'postchanged' ||
    eventType === 'botmessageadded' ||
    !!body?.post ||
    !!body?.message
  );
}

function pickPostNode(body: AnyRecord): AnyRecord {
  return body?.post || body?.message || body || {};
}

function normalizePost(raw: Record<string, any>): NormalizedPost {
  const post = pickPostNode(raw);

  const id = String(post?.id ?? raw?.id ?? '');
  const groupId = String(post?.groupId ?? raw?.groupId ?? raw?.chatId ?? '');
  const creatorObj = post?.creator || raw?.creator || {};
  const creatorId = String(
    creatorObj?.id ?? post?.creatorId ?? raw?.creatorId ?? '',
  );
  const creatorName = String(
    creatorObj?.name ?? post?.creatorName ?? raw?.creatorName ?? '',
  );
  const createdAt = Date.parse(
    String(post?.creationTime ?? raw?.creationTime ?? new Date().toISOString()),
  );

  const parentId: string | undefined =
    post?.parentId ??
    post?.rootId ??
    post?.topicId ??
    post?.quoteOfId ??
    undefined;

  const chatType =
    String(
      post?.group?.type ??
        raw?.group?.type ??
        raw?.chat?.type ??
        raw?.groupType ??
        '',
    ) || 'Group';

  const mentions: any[] =
    (Array.isArray(post?.mentions) && post.mentions) ||
    (Array.isArray(raw?.post?.mentions) && raw.post.mentions) ||
    (Array.isArray(raw?.message?.mentions) && raw.message.mentions) ||
    (Array.isArray(raw?.mentions) && raw.mentions) ||
    [];

  const attachments: any[] = Array.isArray(post?.attachments)
    ? post.attachments
    : [];
  const hasQuote =
    Boolean(post?.quoteOfId) ||
    attachments.some((a) => String(a?.type || '').toLowerCase() === 'quote');

  const rawText = String(post?.text ?? raw?.text ?? '');
  const cleanText = rawText.replace(MENTIONS_MARKUP_REGEX, '').trim();
  const textNoQuotes = stripQuotedText(cleanText);

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
    hasQuote,
    textNoQuotes,
  };
}

/** Was the bot addressed? (DM, explicit mention entity, or name match) */
function wasBotMentioned(n: NormalizedPost): boolean {
  const isDirect = n.chatType === 'Direct';
  if (isDirect) return true;

  const mentionedById = n.mentions.some((m: any) => String(m?.id) === BOT_ID);
  const nameMention = new RegExp(`\\b${APP_CONFIG.BOT_NAME}\\b`, 'i').test(
    n.cleanText,
  );
  return mentionedById || nameMention;
}

async function indexMessage(n: NormalizedPost) {
  const text = n.textNoQuotes || n.cleanText;
  if (!text) return;

  let display = n.creatorName;
  if (!display || /^\d{5,}$/.test(display)) {
    display =
      (await resolveDisplayName(n.creatorId, n.groupId, n.mentions)) ||
      n.creatorName ||
      '';
  }

  await indexIncoming({
    id: n.id,
    chatId: n.groupId,
    authorId: n.creatorId,
    authorName: display,
    createdAt: n.createdAt,
    text,
    parentId: n.parentId,
  });
}

/** Auto-answer (only in non-DM + not mentioned branch) */
async function tryAutoAnswer(n: NormalizedPost) {
  const visible = n.textNoQuotes || n.cleanText;
  if (!visible) return;
  if (n.hasQuote && !QUESTION_REGEX.test(visible)) return;

  await maybeAutoReply(
    {
      id: n.id,
      chatId: n.groupId,
      authorId: n.creatorId,
      authorName: n.creatorName,
      createdAt: n.createdAt,
      text: visible,
      parentId: n.parentId,
    },
    (text) => postText(n.groupId as any, text),
  );
}

/** Handle the “mentioned/DM → commands only” branch */
async function handleCommands(n: NormalizedPost) {
  // Strip mention text and split into args
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
    reply: (text: string) => postText(n.groupId as any, text),
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
