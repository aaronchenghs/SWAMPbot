import { GREETING_REGEX } from '../../constants';
import { getRandomGreeting } from '../../utils';
import { Command } from '../types';
import { resolveDisplayName } from '../../services/people.service';

export const helloCommand: Command = {
  name: 'hello',
  aliases: ['hi', 'hey', 'howdy'],
  description: 'Say hi back with a fun quip',
  usage: 'hello',
  matches: (text) => GREETING_REGEX.test(text),
  async run(ctx) {
    const name =
      (ctx.creatorName && ctx.creatorName !== 'friend'
        ? ctx.creatorName
        : await resolveDisplayName(ctx.creatorId)) || 'friend';

    await ctx.reply(getRandomGreeting(name));
  },
};
