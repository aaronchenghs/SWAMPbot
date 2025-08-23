import { RcId } from './commands/types';
import { cfg } from './config';

export function getRandomGreeting(displayName?: string) {
  const name = displayName || 'friend';
  const quips = [
    `Howdy, ${name}! How's your fantasy team doing? 🏈`,
    `oh hi ${name} 👋 — has anyone made the Jimmy Johns order yet? 🥪`,
    `Hello ${name}! Today's vibe: commit directly to prod! 🚀`,
    `hey ${name} — did you remember to run a build on that frontend? 😅`,
    `sup ${name}. i heard you like bots so i put a bot in your chat 🤖`,
    `What's up ${name}! Do you know if we've restocked the coffee?. ☕`,
    `Hey ${name}, down for some foosball? ⚽`,
    `Hey ${name}, think you could review my MR real quick? 🙏`,
    `hello ${name}! Are we ready to go to non-prod yet? 🛫`,
    `Hey ${name}, GEAUX TIGERS! 🐯🟪🟨`,
    `Hey ${name}, LIONS UP! 🦁🟩🟨`,
  ];
  return quips[Math.floor(Math.random() * quips.length)];
}

export function mentionsBot(text: string) {
  if (!cfg.BOT_NAME) return true;
  return new RegExp(cfg.BOT_NAME, 'i').test(text || '');
}

export const mentionPerson = (id: RcId) => `![:Person](${id})`;
export const mentionTeam = (id: RcId) => `![:Team](${id})`;
