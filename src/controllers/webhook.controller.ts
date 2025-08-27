import { Router, json } from 'express';
import { BOT_ID, MENTIONS_MARKUP_REGEX, QUESTION_REGEX } from '../constants';
import {
  extractCommandText,
  lookUpCommand,
  buildHelpMessage,
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
  const vToken = req.get('Verification-Token');
  if (
    APP_CONFIG.VERIFICATION_TOKEN &&
    vToken !== APP_CONFIG.VERIFICATION_TOKEN
  ) {
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }

  res.status(200).end();

  try {
    const body: AnyRecord = (req.body && (req.body.body || req.body)) || {};
    if (!isTeamMessagingPostEvent(body)) return;
    const post = normalizePost(body);
    if (post.creatorId === BOT_ID) return; // ignore bot's own messages

    await indexMessage(post);
    if (wasBotMentioned(post)) {
      await handleCommands(post);
      console.log('Exiting webhook after handling command.');
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
function wasBotMentioned(post: NormalizedPost): boolean {
  const isDM = post.chatType === 'Direct';
  if (isDM) return true;

  const wasMentionedById = post.mentions.some(
    (mention: any) => String(mention?.id) === BOT_ID,
  );
  return wasMentionedById;
}

async function indexMessage(post: NormalizedPost) {
  const text = post.textNoQuotes || post.cleanText;
  if (!text) return;

  let display = post.creatorName;
  if (!display || /^\d{5,}$/.test(display)) {
    display =
      (await resolveDisplayName(post.creatorId, post.groupId, post.mentions)) ||
      post.creatorName ||
      '';
  }

  await indexIncoming({
    id: post.id,
    chatId: post.groupId,
    authorId: post.creatorId,
    authorName: display,
    createdAt: post.createdAt,
    text,
    parentId: post.parentId,
  });
}

/** Auto-answer (only in non-DM + not mentioned branch) */
async function tryAutoAnswer(post: NormalizedPost) {
  const visible = post.textNoQuotes || post.cleanText;
  if (!visible) return;
  if (post.hasQuote && !QUESTION_REGEX.test(visible)) return;

  await maybeAutoReply(
    {
      id: post.id,
      chatId: post.groupId,
      authorId: post.creatorId,
      authorName: post.creatorName,
      createdAt: post.createdAt,
      text: visible,
      parentId: post.parentId,
    },
    (text) => postText(post.groupId as any, text),
  );
}

/** Handle the “mentioned/DM → commands only” branch */
async function handleCommands(post: NormalizedPost) {
  console.log('Handling command for post:', post);
  // Strip mention text and split into args
  const cmdText = extractCommandText(post.cleanText);
  const args = cmdText.split(/\s+/).filter(Boolean);

  // Pure ping → help and return
  if (args.length === 0) {
    await postText(post.groupId as any, buildHelpMessage());
    return;
  }

  const ctx: any = {
    text: post.cleanText,
    cleanText: cmdText,
    args,
    chatId: post.groupId,
    chatType: post.chatType,
    creatorId: post.creatorId,
    creatorName: post.creatorName,
    parentPostId: post.parentId,
    reply: (text: string) => postText(post.groupId as any, text),
  };

  const cmd = lookUpCommand(cmdText.toLowerCase(), ctx);
  if (!cmd) {
    await postText(post.groupId as any, buildHelpMessage());
    return;
  }

  try {
    await Promise.resolve(cmd.run(ctx));
  } catch (err: any) {
    console.error('command error:', err);
    await postText(
      post.groupId as any,
      `Whoops, that command hiccuped: ${err?.message || 'error'}`,
    );
  }
}
