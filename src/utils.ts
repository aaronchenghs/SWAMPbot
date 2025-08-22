import { cfg } from './config';

export function getRandomGreeting(displayName?: string) {
  const name = displayName || 'friend';
  const quips = [
    `Howdy, ${name}! How's your fantasy team doing? 🏈`,
    `oh hi ${name} 👋 — did someone say banger?`,
    `Hello ${name}! Today's vibe: commit directly to prod! 🚀`,
    `hey ${name} — did you remember to run a build on that frontend? 😅`,
    `sup ${name}. i heard you like bots so i put a bot in your chat 🤖`,
    `What's up ${name}! Do you know if we've restocked the coffee?. ☕`,
    `Hey ${name}, down for some foosball? ⚽`,
  ];
  return quips[Math.floor(Math.random() * quips.length)];
}

export function mentionsBot(text: string) {
  if (!cfg.BOT_NAME) return true;
  return new RegExp(cfg.BOT_NAME, 'i').test(text || '');
}
