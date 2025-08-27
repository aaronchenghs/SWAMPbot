import { Command } from '../types';
import { generateRoast } from '../../ai/openai';

function extractTaggedTarget(text: string): { mention: string; id?: string } | null {
  const idMatch = text.match(/<@([A-Za-z0-9._-]+)>/);
  if (idMatch) {
    const id = String(idMatch[1]);
    return { mention: `<@${id}>`, id };
  }

  const nameMatch = text.match(/@([^\s<>@][^\s<>@]*)/);
  if (nameMatch) {
    return { mention: `@${nameMatch[1]}` };
  }

  return null;
}

export const roastCommand: Command = {
  name: 'roast',
  description: 'Roast a tagged user',
  usage: 'roast <@id> | roast @Name',
  matches: (text) => /^roast\b/i.test(text.trim()),
  async run(ctx) {
    const target = extractTaggedTarget(ctx.text || '');

    if (!target) {
      await ctx.reply('Usage: roast <@id> or roast @Name — tag someone to roast.');
      return;
    }

    if (target.id && (ctx as any).botId && String(target.id) === String((ctx as any).botId)) {
      await ctx.reply("Nice try, but I’m flameproof. Pick a human. 🔥");
      return;
    }

    const line = await generateRoast(target.mention, { style: 'gentle' });
    await ctx.reply(`🔥 ${line}`);
  },
};
