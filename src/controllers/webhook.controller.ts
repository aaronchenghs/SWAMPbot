// src/controllers/webhook.controller.ts
import { Router, json } from 'express';
import { platform } from '../services/ringcentral.service';
import { cfg } from '../config';

export const webhookRouter = Router();

async function postText(chatId: string, text: string) {
  console.log('Posting text to chat', chatId, text);
  await platform.post(`/team-messaging/v1/chats/${chatId}/posts`, { text });
}

function randomQuip(displayName?: string) {
  const name = displayName || 'friend';
  const quips = [
    `Howdy, ${name}! I only bite stale JIRA tickets 🐊`,
    `oh hi ${name} 👋 — did someone say banger?`,
    `Hello ${name}! Today's vibe check: ship > perfect.`,
    `hey ${name} — if code compiles, it ships. that's the law.`,
    `sup ${name}. i heard you like bots so i put a bot in your chat 🤖`,
    `Greetings ${name}! I run on caffeine and optimistic typing.`,
  ];
  return quips[Math.floor(Math.random() * quips.length)];
}

const BOT_ID = (process.env.BOT_EXTENSION_ID || '').trim();

function extractMentionIdsFromText(text: string): string[] {
  const ids: string[] = [];
  const re = /!\[:[^\]]+\]\((\d+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[1]);
  return ids;
}

webhookRouter.post('/', json(), async (req, res) => {
  console.log('Webhook event received');

  const validation = req.get('Validation-Token');
  if (validation) {
    res.set('Validation-Token', validation);
    return res.status(200).end();
  }

  const vt = req.get('Verification-Token');
  if (process.env.VERIFICATION_TOKEN && vt !== process.env.VERIFICATION_TOKEN) {
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }

  res.status(200).end();

  try {
    const evt: any = (req.body && (req.body.body || req.body)) || {};
    const event = String(req.body?.event || evt?.event || '');
    const eventType = String(
      evt?.eventType || evt?.body?.eventType || '',
    ).toLowerCase();

    const isPostEvent =
      event.includes('/team-messaging/v1/posts') ||
      eventType === 'postadded' ||
      eventType === 'botmessageadded' ||
      !!evt?.post ||
      !!evt?.message;

    if (!isPostEvent) return;

    const rawText: string = String(
      evt?.text || evt?.post?.text || evt?.message?.text || '',
    );
    const groupId: string = String(
      evt?.groupId ||
        evt?.post?.groupId ||
        evt?.message?.groupId ||
        evt?.group?.id ||
        evt?.chatId ||
        '',
    );
    const chatType: string = String(
      evt?.group?.type ||
        evt?.post?.group?.type ||
        evt?.chat?.type ||
        evt?.groupType ||
        '',
    );
    const creator =
      evt?.creator || evt?.post?.creator || evt?.message?.creator || {};
    const creatorName: string = String(creator?.name || 'friend');
    const creatorId: string = String(creator?.id || '');

    if (!groupId) {
      console.warn('Webhook: no groupId found; skipping');
      return;
    }

    const cleanText = rawText.replace(/!\[:[^\]]+\]\([^)]+\)/g, '').trim();

    const looksGreeting = /\b(hi|hello|hey|howdy|yo|sup)\b/i.test(cleanText);

    const mentions =
      (Array.isArray(evt?.mentions) && evt.mentions) ||
      (Array.isArray(evt?.post?.mentions) && evt.post.mentions) ||
      (Array.isArray(evt?.message?.mentions) && evt.message.mentions) ||
      [];

    const isDirect = chatType === 'Direct';

    let mentionedBot = isDirect;
    if (BOT_ID) {
      const mentionedByArray = mentions.some(
        (m: any) => String(m?.id) === BOT_ID,
      );
      const mentionedByMarkup =
        extractMentionIdsFromText(rawText).includes(BOT_ID);
      mentionedBot = mentionedBot || mentionedByArray || mentionedByMarkup;
    } else {
      console.warn(
        'BOT_EXTENSION_ID is not set; using name regex fallback (less reliable).',
      );
      mentionedBot =
        mentionedBot || new RegExp(`@?${cfg.BOT_NAME}`, 'i').test(cleanText);
    }

    if (creatorId && BOT_ID && creatorId === BOT_ID) return;

    if (looksGreeting && mentionedBot) {
      await postText(groupId, randomQuip(creatorName));
      console.log(`Webhook: replied in ${groupId}`);
    }
  } catch (e) {
    console.error('webhook greeter error:', e);
  }
});
