export type RcId = `${number}`;
export type ChatType = 'Team' | 'Direct' | 'Everyone' | 'Personal';
export type CommandName = `${Lowercase<string>}`;
export type ReplyFn = (text: string) => Promise<void>;
export type CommandContext = Readonly<{
  text: string;
  cleanText: string;
  args: ReadonlyArray<string>;
  chatId: RcId;
  chatType: ChatType;
  creatorId: RcId;
  creatorName: string;
  reply: ReplyFn;
}>;

export type CommandMatcher = (text: string, ctx: CommandContext) => boolean;

export type Command = Readonly<{
  name: CommandName;
  aliases?: ReadonlyArray<CommandName>;
  description?: string;
  usage?: string;
  matches?: CommandMatcher;
  run: (ctx: CommandContext) => void | Promise<void>;
}>;
