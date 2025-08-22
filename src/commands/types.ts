export interface CommandContext {
  text: string;
  cleanText: string;
  args: string[];
  chatId: string;
  chatType: string;
  creatorId: string;
  creatorName: string;
  reply: (text: string) => Promise<void>;
}

export interface Command {
  name: string;
  aliases?: string[];
  description?: string;
  usage?: string;
  matches?: (text: string, ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => Promise<void> | void;
}
