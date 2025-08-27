import { helloCommand } from './commandFunctions/hello';
import { createHelpCommand } from './commandFunctions/help';
import { pingCommand } from './commandFunctions/ping';
import { flipCommand } from './commandFunctions/flip';
import { lotteryCommand } from './commandFunctions/lottery';
import { Command } from './types';

const _commands: Command[] = [helloCommand, pingCommand, flipCommand, lotteryCommand];
const help = createHelpCommand(() => _commands);

export const commands: Command[] = [..._commands, help];
