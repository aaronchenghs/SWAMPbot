import { GREETING_REGEX } from '../../constants';
import { getCoinFlip } from '../../utils/generalUtils';
import { Command } from '../types';

export const flipCommand: Command = {
  name: 'flip',
  description: 'flips a coin {choice heads or tails}',
  usage: 'flip [heads|tails]',
  matches: (text) => /^flip(\s+(heads|tails))?$/i.test(text.trim()),
  async run(ctx) {
    const parts = ctx.text.trim().split(/\s+/);

    const choice = parts[1];

    await ctx.reply(getCoinFlip(ctx.creatorName, ctx.creatorId, choice));
  },
};
