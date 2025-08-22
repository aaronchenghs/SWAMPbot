// src/webhookUtils.ts
import { platform } from './services/ringcentral.service';
import type { RcId, MentionSpec } from './commands/types';

export async function postText(
  chatId: RcId,
  text: string,
  opts?: { mentions?: ReadonlyArray<MentionSpec> },
) {
  const body: any = { text };
  if (opts?.mentions?.length) {
    body.mentions = opts.mentions.map((m) => ({
      id: String(m.id),
      type: m.type,
    }));
  }
  await platform.post(`/team-messaging/v1/chats/${chatId}/posts`, body);
}
