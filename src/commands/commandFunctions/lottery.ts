// commands/lottery.ts
import { Command } from '../types';
import { ensureChatMembers } from '../../services/names.service';
// If you already have a formatter, import it. Otherwise, inline:
function formatMention(id?: string, name?: string) {
  return id ? `<@${id}>` : (name ?? 'someone');
}

type Ctx = {
  text: string;
  reply: (msg: string) => Promise<void>;
  chatId?: string;           // ensure this is set in your middleware
  conversationId?: string;   // fallback name in some setups
  botId?: string;
};

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export const lotteryCommand: Command = {
  name: 'pick',
  description: 'Randomly pick N winners from this chat. Usage: "pick 3"',
  usage: 'pick {number}',
  matches: (text) => text.toLowerCase().startsWith('pick'),
  async run(ctx: Ctx) {
    // 1) Parse "pick {number}"
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

    // 2) Figure out the chat id your ensureChatMembers expects
    const chatId = ctx.chatId ?? ctx.conversationId;
    if (!chatId) {
      await ctx.reply('I could not determine this chat id.');
      return;
    }

    // 3) Use your working function to get the members map (id -> displayName)
    const membersMap = await ensureChatMembers(chatId);

    // Build the pool from the map
    let pool = Array.from(membersMap.entries()).map(([id, name]) => ({ id, name }));

    // 4) Exclude ONLY the bot so DMs still work (user remains eligible)
    if (ctx.botId) {
      const botId = String(ctx.botId);
      pool = pool.filter(p => String(p.id) !== botId);
    }

    if (pool.length === 0) {
      await ctx.reply("I couldn't find anyone to pick from in this chat.");
      return;
    }

    // 5) Shuffle and pick
    shuffle(pool);
    const count = Math.min(requested, pool.length);
    const cappedNote = requested > pool.length ? ` (only ${pool.length} available)` : '';
    const winners = pool.slice(0, count);

    // 6) Reply
    const list = winners
      .map((p, i) => `${i + 1}. ${formatMention(p.id, p.name)}`)
      .join('\n');

    await ctx.reply(
      `🎟️ Lottery time! Picking ${count} winner${count > 1 ? 's' : ''}${cappedNote}:\n${list}\n\nYippee woohoo to the winners!`
    );
  },
};
