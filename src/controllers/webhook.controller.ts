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

webhookRouter.post('/', json(), async (req, res) => {
  // Subscription API handshake (not used if you set webhooks in console)
  const validation = req.get('Validation-Token');
  if (validation) {
    res.set('Validation-Token', validation);
    return res.status(200).end();
  }

  // Console “Enable bot webhooks” verification
  const vt = req.get('Verification-Token');
  if (process.env.VERIFICATION_TOKEN && vt !== process.env.VERIFICATION_TOKEN) {
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }

  res.status(200).end();

  try {
    const raw: any = (req.body && (req.body.body || req.body)) || {};
    const envelopeEvent = String(req.body?.event || raw?.event || '');
    const eventType = String(
      raw?.eventType || raw?.body?.eventType || '',
    ).toLowerCase();

    const isPostEvent =
      envelopeEvent.includes('/team-messaging/v1/posts') ||
      eventType === 'postadded' ||
      eventType === 'postchanged' ||
      eventType === 'botmessageadded' ||
      !!raw?.post ||
      !!raw?.message;

    if (!isPostEvent) return;

    const post = raw.post || raw.message || raw;

    const id: string = String(post?.id ?? raw?.id ?? '');
    const groupId: string = String(
      post?.groupId ?? raw?.groupId ?? raw?.chatId ?? '',
    );
    const creator = post?.creator || raw?.creator || {};
    const creatorId: string = String(creator?.id || '');
    const creatorName: string = String(creator?.name || 'friend');
    const createdAt: number = Date.parse(
      String(
        post?.creationTime || raw?.creationTime || new Date().toISOString(),
      ),
    );

    const parentId: string | undefined =
      post?.parentId ||
      post?.rootId ||
      post?.topicId ||
      post?.quoteOfId ||
      undefined;

    const chatType: string = String(
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

    // Text (strip RC mention markup like !)
    const rawText: string = String(post?.text || raw?.text || '');
    const cleanText = rawText.replace(MENTIONS_MARKUP_REGEX, '').trim();

    // Ignore the bot’s own messages
    if (creatorId === BOT_ID) return;

    // --- 1) Index every user message + try auto-answer on likely questions ---
    if (cleanText) {
      console.log(cleanText);
      await indexIncoming({
        id,
        chatId: groupId,
        authorId: creatorId,
        authorName: creatorName,
        createdAt,
        text: cleanText,
        parentId,
      });

      await maybeAutoReply(
        {
          id,
          chatId: groupId,
          authorId: creatorId,
          authorName: creatorName,
          createdAt,
          text: cleanText,
          parentId,
        },
        (text: string) => postText(groupId as any, text),
      );
    }

    // --- 2) Commands & fun replies (mention-based) ---
    const isDirect = chatType === 'Direct';
    const mentionedBot =
      isDirect ||
      mentions.some((m: any) => String(m?.id) === BOT_ID) ||
      new RegExp(`\\b${cfg.BOT_NAME}\\b`, 'i').test(cleanText);

    if (!mentionedBot) return;

    // Command extraction
    const cmdText = extractCommandText(cleanText);
    const args = cmdText.split(/\s+/).filter(Boolean);

    // If purely a ping (no content) → help
    if (args.length === 0) {
      return postText(groupId as any, helpMessage());
    }

    // Build a minimal ctx for your Command interface
    const ctx: any = {
      text: cleanText,
      cleanText: cmdText,
      args,
      chatId: groupId,
      chatType,
      creatorId,
      creatorName,
      parentPostId: parentId,
      reply: (text: string, extra?: any) =>
        postText(groupId as any, text, extra),
    };

    const cmd = findCommand(cmdText.toLowerCase(), ctx);

    if (cmd) {
      try {
        await Promise.resolve(cmd.run(ctx));
      } catch (err: any) {
        console.error('command error:', err);
        await postText(
          groupId as any,
          `Whoops, that command hiccuped: ${err?.message || 'error'}`,
        );
      }
    } else {
      // Fallback to help when command not recognized
      await postText(groupId as any, helpMessage());
    }
  } catch (e) {
    console.error('webhook controller error:', e);
  }
});
