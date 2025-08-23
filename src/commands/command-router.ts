import { Command, CommandContext } from '../commands/types';

export const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';

export class CommandRouter {
  constructor(private readonly commands: Command[]) {}

  list() {
    return this.commands.filter(Boolean);
  }

  /**
   * Parse the first token as a command.
   */
  private parse(cleanText: string): { cmdName: string; args: string[] } {
    const trimmed = cleanText.trim();
    if (!trimmed) return { cmdName: '', args: [] };

    const withoutPrefix = trimmed.startsWith(COMMAND_PREFIX)
      ? trimmed.slice(COMMAND_PREFIX.length).trim()
      : trimmed;

    const tokens = withoutPrefix.split(/\s+/);
    const cmdName = (tokens[0] || '').toLowerCase();
    const args = tokens.slice(1);
    return { cmdName, args };
  }

  async handle(base: Omit<CommandContext, 'args'>) {
    const { cmdName, args } = this.parse(base.cleanText);
    const ctx: CommandContext = { ...base, args };

    for (const c of this.commands) {
      if (typeof c.matches === 'function' && c.matches(ctx.cleanText, ctx)) {
        return c.run(ctx);
      }
    }

    const target = this.commands.find((c) => {
      if (c.name.toLowerCase() === cmdName) return true;
      return (c.aliases || []).some((a) => a.toLowerCase() === cmdName);
    });

    if (target) return target.run(ctx);

    return;
  }
}
