import { GREETING_REGEX } from '../../constants';
import { getRandomGreeting } from '../../utils';
import { Command } from '../types';

export const helloCommand: Command = {
  name: 'hello',
  aliases: ['hi', 'hey', 'howdy'],
  description: 'Say hi back with a fun quip',
  usage: 'hello',
  matches: (text) => GREETING_REGEX.test(text),
  async run(ctx) {
    const you = `![:Person](${ctx.creatorId})`;
    await ctx.reply(getRandomGreeting(you), {
      mentions: [{ id: ctx.creatorId, type: 'Person' }],
    });
  },
};
