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

// Cache the bot's extension id so we don't fetch it on every event
let cachedBotId = process.env.BOT_EXTENSION_ID || '';

async function getBotExtensionId(): Promise<string> {
  if (cachedBotId) return cachedBotId;
  try {
    const me = await platform
      .get('/restapi/v1.0/account/~/extension/~')
      .then((r) => r.json());
    cachedBotId = String(me?.id || '');
    process.env.BOT_EXTENSION_ID = cachedBotId;
  } catch (e) {
    console.warn('Could not fetch bot extension id:', e);
    cachedBotId = '';
  }
  return cachedBotId;
}

webhookRouter.post('/', json(), async (req, res) => {
  console.log('Webhook event received');

  // Subscription API handshake (not used for console "Enable bot webhooks")
  const validation = req.get('Validation-Token');
  if (validation) {
    res.set('Validation-Token', validation);
    return res.status(200).end();
  }

  // Console "Enable bot webhooks" verification
  const vt = req.get('Verification-Token');
  if (process.env.VERIFICATION_TOKEN && vt !== process.env.VERIFICATION_TOKEN) {
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }

  res.status(200).end();

  try {
    // Normalize payload (some events nest under body.body)
    const evt: any = (req.body && (req.body.body || req.body)) || {};
    const event = String(req.body?.event || evt?.event || '');
    const eventType = String(
      evt?.eventType || evt?.body?.eventType || '',
    ).toLowerCase();

    // Only react to new post/message events
    const isPostEvent =
      event.includes('/team-messaging/v1/posts') ||
      eventType === 'postadded' ||
      eventType === 'botmessageadded' ||
      !!evt?.post ||
      !!evt?.message;

    if (!isPostEvent) return;

    // Extract common fields from multiple possible shapes
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

    // Clean RC mention markup from text so greeting regex is reliable
    const cleanText = rawText.replace(/!\[:[^\]]+\]\([^)]+\)/g, '').trim();

    // Greeting detector
    const looksGreeting = /\b(hi|hello|hey|howdy|yo|sup)\b/i.test(cleanText);

    // Pull mentions array if present
    const mentions =
      (Array.isArray(evt?.mentions) && evt.mentions) ||
      (Array.isArray(evt?.post?.mentions) && evt.post.mentions) ||
      (Array.isArray(evt?.message?.mentions) && evt.message.mentions) ||
      [];

    // Determine if the bot was actually mentioned (or if it's a DM)
    const isDirect = chatType === 'Direct';
    const myId = await getBotExtensionId();
    const mentionedBot =
      isDirect ||
      (myId && mentions.some((m: any) => String(m?.id) === myId)) ||
      false;

    if (creatorId && myId && creatorId === myId) return;

    if (looksGreeting && mentionedBot) {
      const msg = randomQuip(creatorName);
      try {
        await postText(groupId, msg);
        console.log(`Webhook: replied in ${groupId}`);
      } catch (postErr) {
        console.error('Webhook: post failed:', postErr);
      }
    }
  } catch (e) {
    console.error('webhook greeter error:', e);
  }
});
