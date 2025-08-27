import { Command } from '../types';
import { generateRoast } from '../../ai/openai';

// Pull the first tagged target: prefer RingCentral <@id>, else plain @Name
function extractTaggedTarget(text: string): { mention: string; id?: string } | null {
  // <@12345> or <@abc-def>
  const idMatch = text.match(/<@([A-Za-z0-9._-]+)>/);
  if (idMatch) {
    const id = String(idMatch[1]);
    return { mention: `<@${id}>`, id };
  }

  // Fallback: @Name (no spaces)
  const nameMatch = text.match(/@([^\s<>@][^\s<>@]*)/);
  if (nameMatch) {
    return { mention: `@${nameMatch[1]}` };
  }

  return null;
}

export const roastCommand: Command = {
  name: 'roast',
  description: 'Roast a tagged user',
  usage: 'roast',
  // Match messages that start with "roast"
  matches: (text) => /^roast\b/i.test(text.trim()),
  async run(ctx) {
    const targetObj = extractTaggedTarget(ctx.text || '');
    const target = targetObj?.mention;

    // if (!target) {
    //   await ctx.reply('Usage: roast <@id> or roast @Name — tag someone to roast.');
    //   return;
    // }

    const line = await generateRoast(target, { style: 'spicy' });
    await ctx.reply(`🔥 ${line}`);
  },
};
