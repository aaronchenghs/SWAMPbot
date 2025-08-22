import { platform } from './services/ringcentral.service';

export async function postText(chatId: string, text: string) {
  await platform.post(`/team-messaging/v1/chats/${chatId}/posts`, { text });
}
