import { HEADS_TAILS_REGEX } from '../../constants';
import { getCoinFlip } from '../../utils/generalUtils';
import { Command } from '../types';

export const flipCommand: Command = {
  name: 'flip',
  description: 'flips a coin {choice heads or tails}',
  usage: 'flip [heads|tails]',
  matches: (text) => HEADS_TAILS_REGEX.test(text.trim()),
  async run(ctx) {
    const parts = ctx.text.trim().split(/\s+/);
    const choice = parts[1];
    await ctx.reply(getCoinFlip(ctx.creatorName, ctx.creatorId, choice));
  },
};
