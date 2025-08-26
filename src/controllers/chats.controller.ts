import { Router } from 'express';
import { platform } from '../services/ringcentral.service';
export const chatsRouter = Router();

chatsRouter.get('/', async (_req, res) => {
  const out: any[] = [];
  let pageToken: string | undefined;
  do {
    const params: any = {
      recordCount: 200,
      ...(pageToken ? { pageToken } : {}),
    };
    const response = await platform.get('/team-messaging/v1/chats', params);
    const responseJSON = await response.json();
    out.push(...(responseJSON?.records ?? []));
    pageToken = responseJSON?.navigation?.nextPageToken;
  } while (pageToken);
  res.json(out.map((c) => ({ id: c.id, type: c.type, name: c.name })));
});
