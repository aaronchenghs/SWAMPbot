import { helloCommand } from './commandFunctions/hello';
import { createHelpCommand } from './commandFunctions/help';
import { pingCommand } from './commandFunctions/ping';
import { flipCommand } from './commandFunctions/flip';
import { Command } from './types';
import { roastCommand } from './commandFunctions/roast';

const _commands: Command[] = [
  helloCommand,
  pingCommand,
  flipCommand,
  roastCommand,
];
const help = createHelpCommand(() => _commands);

export const commands: Command[] = [..._commands, help];
