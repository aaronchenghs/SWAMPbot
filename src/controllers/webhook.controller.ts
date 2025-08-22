import { Router, json } from 'express';
import { platform } from '../services/ringcentral.service';
import { cfg } from '../config';

export const webhookRouter = Router();

// Minimal helper to post plain text
async function postText(chatId: string, text: string) {
  console.log('Posting text to chat', chatId, text);
  await platform.post(`/team-messaging/v1/chats/${chatId}/posts`, { text });
}

function randomQuip(displayName?: string) {
  console.log('Generating quip for', displayName);
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

webhookRouter.post('/', json(), async (req, res) => {
  console.log('Webhook event received');
  console.log('1');
  const validation = req.get('Validation-Token');
  console.log('2');
  if (validation) {
    console.log('3');
    res.set('Validation-Token', validation);
    return res.status(200).end();
  }
  console.log('4');
  const vt = req.get('Verification-Token');
  console.log('5');
  if (process.env.VERIFICATION_TOKEN && vt !== process.env.VERIFICATION_TOKEN) {
    console.log('6');
    console.warn('Webhook rejected: bad verification token');
    return res.status(401).end();
  }
  console.log('7');
  res.status(200).end();

  try {
    const body: any = (req.body && (req.body.body || req.body)) || {};
    console.log('8');

    const text: string = body?.text || body?.post?.text || '';
    const chatId: string = body?.groupId || body?.chatId || body?.post?.groupId;
    const chatType: string =
      body?.group?.type || body?.chat?.type || body?.post?.group?.type || '';
    const creatorName: string =
      body?.creator?.name || body?.post?.creator?.name || 'friend';
    console.log('9', text, chatId);

    if (!text || !chatId) return;
    console.log('10');
    const looksGreeting = /\b(hi|hello|hey|howdy)\b/i.test(text);
    const mentioned =
      chatType === 'Direct' || new RegExp(cfg.BOT_NAME, 'i').test(text);

    if (looksGreeting && mentioned) {
      console.log('11');
      await postText(chatId, randomQuip(creatorName));
    }
  } catch (e) {
    console.error('webhook greeter error:', e);
  }
});
