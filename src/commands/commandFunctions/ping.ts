import { Command } from '../types';

export const pingCommand: Command = {
  name: 'ping',
  description: 'Check liveness',
  usage: 'ping',
  async run(ctx) {
    await ctx.reply('pong 🏓');
  },
};
