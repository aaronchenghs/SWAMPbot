import { Router, json } from 'express';
import { BOT_ID, GREETING_REGEX, MENTIONS_MARKUP_REGEX } from '../constants';
import { getRandomGreeting } from '../utils';
import { postText } from '../webhookUtils';

export const webhookRouter = Router();

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

    // Clean RC mention markup from text so greeting regex is reliable
    const cleanText = rawText.replace(MENTIONS_MARKUP_REGEX, '').trim();

    // Greeting detector
    const looksGreeting = GREETING_REGEX.test(cleanText);

    // Pull mentions array if present
    const mentions =
      (Array.isArray(evt?.mentions) && evt.mentions) ||
      (Array.isArray(evt?.post?.mentions) && evt.post.mentions) ||
      (Array.isArray(evt?.message?.mentions) && evt.message.mentions) ||
      [];

    // Determine if the bot was actually mentioned (or if it's a DM)
    const isDirect = chatType === 'Direct';
    const mentionedBot =
      isDirect || mentions.some((m: any) => String(m?.id) === BOT_ID) || false;

    if (creatorId && creatorId === BOT_ID) return;

    if (looksGreeting && mentionedBot) {
      console.log('Trying to get the greeting for', creatorName);
      const msg = getRandomGreeting(creatorName);
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
