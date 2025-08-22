import { Command } from '../types';

export function createHelpCommand(listCommands: () => Command[]): Command {
  return {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands',
    usage: 'help',
    async run(ctx) {
      const cmds = listCommands();
      const lines = cmds.map((c) => {
        const names = [c.name, ...(c.aliases || [])].join(', ');
        return `• **${names}** — ${c.description || ''}${c.usage ? `  \n   Usage: \`${c.usage}\`` : ''}`;
      });
      await ctx.reply(`**SWAMPbot commands**\n` + lines.join('\n'));
    },
  };
}
