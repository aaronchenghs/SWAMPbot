import { helloCommand } from './commandFunctions/hello';
import { createHelpCommand } from './commandFunctions/help';
import { pingCommand } from './commandFunctions/ping';
import { Command } from './types';

const _commands: Command[] = [helloCommand, pingCommand];
const help = createHelpCommand(() => _commands);

export const commands: Command[] = [..._commands, help];
