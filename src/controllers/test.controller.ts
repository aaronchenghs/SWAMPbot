import { Router } from 'express';
import { platform } from '../services/ringcentral.service';
export const testRouter = Router();

testRouter.post('/post-test', async (req, res) => {
  const chatId = req.body?.chatId;
  if (!chatId) return res.status(400).send('Provide { chatId }');
  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.3',
    body: [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: '🤖🐊 SWAMPbot is alive!',
      },
      {
        type: 'TextBlock',
        isSubtle: true,
        text: 'ARA`s SWAMPBot is here to help you with your work day.',
      },
    ],
  };
  await platform.post(
    `/team-messaging/v1/chats/${chatId}/adaptive-cards`,
    card,
  );
  res.send('ok');
});
