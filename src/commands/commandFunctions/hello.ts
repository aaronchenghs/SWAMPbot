import { GREETING_REGEX } from '../../constants';
import { getRandomGreeting, mentionPerson } from '../../utils';
import { Command } from '../types';

export const helloCommand: Command = {
  name: 'hello',
  aliases: ['hi', 'hey', 'howdy'],
  description: 'Say hi back with a fun quip',
  usage: 'hello',
  matches: (text) => GREETING_REGEX.test(text),
  async run(ctx) {
    const display =
      ctx.creatorName && ctx.creatorName !== 'friend'
        ? ctx.creatorName
        : mentionPerson(ctx.creatorId);

    await ctx.reply(getRandomGreeting(display));
  },
};
