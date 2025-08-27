import { Command } from '../types';
import { Participant} from '../../utils/generalUtils';
import { formatMention } from '../../utils/webhookUtils';

type RCPlatform = {
  get: (url: string) => Promise<{ json: () => Promise<any> }>;
};

type Ctx = {
  text: string;
  reply: (msg: string) => Promise<void>;
  rc?: RCPlatform;
  chatId?: string;
  conversationId?: string;
  participants?: Participant[];
  creatorId?: string;
  botId?: string;
};

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function fetchParticipantsFromRingCentral(ctx: Ctx): Promise<Participant[]> {
  const platform = ctx.rc;
  const convId = ctx.chatId || ctx.conversationId;
  if (!platform || !convId) return [];

  const convRes = await platform.get(`/restapi/v1.0/glip/conversations/${convId}`);
  const conv = await convRes.json();
  const memberIds: string[] = Array.isArray(conv?.members)
    ? conv.members.map((m: any) => String(m?.id)).filter(Boolean)
    : [];

  if (memberIds.length === 0) return [];

  try {
    const idsParam = memberIds.join(',');
    const personsRes = await platform.get(`/restapi/v1.0/glip/persons?ids=${encodeURIComponent(idsParam)}`);
    const persons = await personsRes.json();

    const byId: Record<string, any> = {};
    for (const p of persons?.records ?? []) byId[String(p.id)] = p;

    return memberIds.map(id => {
      const p = byId[id];
      const name = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || undefined : undefined;
      return { id, name };
    });
  } catch {
    return memberIds.map(id => ({ id }));
  }
}

async function getParticipantPool(ctx: Ctx): Promise<Participant[]> {
  const fromCtx = (ctx.participants ?? []).filter(p => p && (p.id || p.name));
  if (fromCtx.length > 0) return fromCtx;

  return await fetchParticipantsFromRingCentral(ctx);
}

export const lotteryCommand: Command = {
  name: 'pick',
  description: 'Randomly pick N winners from this group chat. Usage: "pick 3"',
  usage: 'pick {number}',
  matches: (text: string) => text.toLowerCase().startsWith('pick'),
  async run(ctx: Ctx) {
    const m = ctx.text.match(/^\s*pick\s+(\d+)\s*$/i);
    if (!m) {
      await ctx.reply('Usage: pick {number} — e.g., "pick 3"');
      return;
    }

    const requested = parseInt(m[1], 10);
    if (!Number.isFinite(requested) || requested <= 0) {
      await ctx.reply('Please provide a positive number of winners to pick.');
      return;
    }

    let pool = await getParticipantPool(ctx);

    const exclude = new Set([ctx.botId, ctx.creatorId].filter(Boolean).map(String));
    pool = pool
      .filter(p => p && (p.id || p.name))
      .filter(p => (p.id ? !exclude.has(String(p.id)) : true));

    const seen = new Set<string>();
    pool = pool.filter(p => {
      if (!p.id) return true;
      const key = String(p.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (pool.length === 0) {
      await ctx.reply("I couldn't find anyone to pick from in this chat.");
      return;
    }

    const count = Math.min(requested, pool.length);
    const cappedNote = requested > pool.length ? ` (only ${pool.length} available)` : '';

    shuffle(pool);
    const winners = pool.slice(0, count);

    const list = winners.map((p, i) => `${i + 1}. ${formatMention(p.id, p.name)}`).join('\n');
    await ctx.reply(
      `🎟️ Lottery time! Picking ${count} winner${count > 1 ? 's' : ''}${cappedNote}:\n${list}\n\nYippee woohoo to the winners!`
    );
  },
};
