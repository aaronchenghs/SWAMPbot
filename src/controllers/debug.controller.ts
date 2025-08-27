import { Router } from 'express';
import { platform } from '../services/ringcentral.service';

export const debugRouter = Router();

debugRouter.get('/bot-ids', async (_req, res) => {
  try {
    // Extension (telephony) identity — useful sanity check
    const extResp = await platform.get('/restapi/v1.0/account/~/extension/~');
    const ext = await extResp.json();

    // Team Messaging "Person" identity — THIS is used in mentions[].id and creatorId
    let me: any = null;
    try {
      const meResp = await platform.get('/team-messaging/v1/persons/~');
      me = await meResp.json();
    } catch (e) {}

    res.json({
      extension: { id: String(ext?.id || ''), name: ext?.name || '' },
      person: { id: String(me?.id || ''), name: me?.name || '' },
      notes: [
        'Use person.id for: mentions[].id match and ignoring your own messages.',
        'Use extension.id only as a sanity check.',
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'failed to fetch IDs' });
  }
});
