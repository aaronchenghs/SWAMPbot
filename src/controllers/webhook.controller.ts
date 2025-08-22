import { Router, json } from 'express';
import { BOT_ID, MENTIONS_MARKUP_REGEX } from '../constants';
import { postText } from '../webhookUtils';
import { commands } from '../commands';
import { CommandRouter } from '../commands/command-router';
import { ChatType, RcId } from '../commands/types';

export const webhookRouter = Router();
const router = new CommandRouter(commands);

webhookRouter.post('/', json(), async (req, res) => {
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
    const groupId: RcId =
      evt?.groupId ||
      evt?.post?.groupId ||
      evt?.message?.groupId ||
      evt?.group?.id ||
      evt?.chatId ||
      '';

    const chatType: ChatType =
      evt?.group?.type ||
      evt?.post?.group?.type ||
      evt?.chat?.type ||
      evt?.groupType ||
      '';

    const creator =
      evt?.creator || evt?.post?.creator || evt?.message?.creator || {};
    const creatorName: string = String(creator?.name || 'friend');
    const creatorId: RcId = creator?.id || '';

    if (!groupId) return;

    // mention detection: array or markup
    const mentions =
      (Array.isArray(evt?.mentions) && evt.mentions) ||
      (Array.isArray(evt?.post?.mentions) && evt.post.mentions) ||
      (Array.isArray(evt?.message?.mentions) && evt.message.mentions) ||
      [];
    const isDirect = chatType === 'Direct';
    const mentioned =
      isDirect ||
      mentions.some((m: any) => String(m?.id) === String(BOT_ID)) ||
      (/!\[:[^\]]+\]\((\d+)\)/g.test(rawText) &&
        rawText.includes(`(${BOT_ID})`));

    if (!mentioned) return;
    if (creatorId && String(creatorId) === String(BOT_ID)) return; // don’t reply to ourselves

    const cleanText = rawText.replace(MENTIONS_MARKUP_REGEX, '').trim();

    await router.handle({
      text: rawText,
      cleanText,
      chatId: groupId,
      chatType,
      creatorId,
      creatorName,
      reply: (text) => postText(groupId, text),
    });
  } catch (e) {
    console.error('webhook command error:', e);
  }
});
