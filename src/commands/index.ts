import { helloCommand } from './commandFunctions/hello';
import { createHelpCommand } from './commandFunctions/help';
import { pingCommand } from './commandFunctions/ping';
import { Command } from './types';

const _commands: Command[] = [helloCommand, pingCommand];

const help = createHelpCommand(() => _commands);

export const commands: Command[] = [..._commands, help];

export const COMMAND_TEMPLATE = `import { Command } from './types';

export const myCommand: Command = {
  name: 'mycmd',
  aliases: [],
  description: 'Describe what it does',
  usage: '!mycmd <arg>',
  matches: undefined, // or (text, ctx) => boolean
  async run(ctx) {
    await ctx.reply('It works!');
  },
};`;
