import {
  BLOCKQUOTE_REGEX,
  QUESTION_REGEX,
  RC_QUOTE_MARKUP_REGEX,
} from '../constants';
import { formatMention } from './webhookUtils';

function pickFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getRandomGreeting(friendName?: string, friendId?: string) {
  const name = formatMention(friendId, friendName);
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
  return pickFrom(quips);
}

export function getCoinFlip(friendName?: string, friendId?: string, flip?: string): string {
  const name = formatMention(friendId, friendName);

  const actualResult = Math.random() < 0.5 ? "Heads" : "Tails";

  if (!flip) {
    return `${name} flipped a coin and got ${actualResult}!`;
  }

  const guess = flip.toLowerCase();
  const won = (guess === actualResult.toLowerCase());

  return `${name} guessed ${flip}, the coin landed on ${actualResult}. ${won ? "Yippee woohoo 🎉" : "Boohoo you lost 😢"}`;
}

const DEDUP_LEADS = [
  'I think we covered this recently',
  'Looks like we might have answered this already',
  'We just discussed that',
  'This was resolved earlier',
  'This came up recently',
  'We’ve got an earlier answer for this',
] as const;

export function getRandomDeadupLead(): string {
  return pickFrom(DEDUP_LEADS);
}

export function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}
  const a = text.indexOf('{'),
    b = text.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) {
    try {
      return JSON.parse(text.slice(a, b + 1));
    } catch {}
  }
  return {};
}

export function heuristicIsQuestion(t: string): boolean {
  return /[?]/.test(t) || QUESTION_REGEX.test(t);
}

export function stripQuotedText(text: string): string {
  if (!text) return '';
  return text
    .replace(BLOCKQUOTE_REGEX, '')
    .replace(RC_QUOTE_MARKUP_REGEX, '')
    .trim();
}

export const isLikelyId = (text?: string) => !!text && /^\d{5,}$/.test(text);
