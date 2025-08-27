import { Command } from '../types';
import { formatMention } from '../../utils/webhookUtils';

import { pickWinners, Participant } from '../../utils/generalUtils';

type Ctx = {
  text: string;
  creatorId?: string;
  creatorName?: string;
  botId?: string;
  participants?: Participant[];
  getParticipants?: () => Promise<Participant[]>;
  reply: (msg: string) => Promise<void>;
};

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

    const raw: Participant[] =
      (typeof ctx.getParticipants === 'function'
        ? await ctx.getParticipants()
        : ctx.participants) ?? [];

    const excludeIds = [ctx.creatorId, ctx.botId].filter(Boolean) as string[];

    const { winners, available } = pickWinners(raw, requested, { excludeIds });

    if (available === 0) {
      await ctx.reply("I couldn't find anyone to pick from in this chat.");
      return;
    }
    if (winners.length === 0) {
      await ctx.reply('No winners could be selected.');
      return;
    }

    const cappedNote = requested > available ? ` (only ${available} available)` : '';
    const list = winners.map((p, i) => `${i + 1}. ${formatMention(p.id, p.name)}`).join('\n');

    await ctx.reply(
      `🎟️ Lottery time! Picking ${winners.length} winner${winners.length > 1 ? 's' : ''}${cappedNote}:\n${list}\n\nYippee woohoo to the winners!`
    );
  },
};