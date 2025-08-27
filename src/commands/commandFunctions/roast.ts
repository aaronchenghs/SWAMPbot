import { Command } from '../types';
import { generateRoast } from '../../ai/openai';
import { resolveDisplayName } from '../../services/names.service';
import { extractTaggedTarget } from '../../utils/generalUtils';

export const roastCommand: Command = {
  name: 'roast',
  description: 'Roast a tagged user',
  usage: 'roast',
  matches: (text) => /^roast\b/i.test(text.trim()),
  async run(ctx) {
    const targetObj = extractTaggedTarget(ctx.text || '');
    const target = targetObj
      ? await resolveDisplayName(targetObj.mention, ctx.chatId)
      : ctx.text;

    const line = await generateRoast(target, { style: 'spicy' });
    await ctx.reply(`🔥 ${line}`);
  },
};
