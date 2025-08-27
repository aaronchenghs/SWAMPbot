export const BOT_ID = '4869825044';
export const GREETING_REGEX = /\b(hi|hello|hey|howdy|yo|sup)\b/i;
export const MENTIONS_MARKUP_REGEX = /!\[:[^\]]+\]\([^)]+\)/g;
export const QUESTION_REGEX =
  /[?？‽]|^\s*(?:[@\w.-]+[:,-]?\s*)*(?:what(?:'|’)?s|who(?:'|’)?s|where(?:'|’)?s|when(?:'|’)?s|why(?:'|’)?s|how(?:'|’)?s|how\s+to|what|why|where|when|who|whom|whose|which|whether|any\s+(?:updates?|chance|idea|ideas|way\s+to)|status\s+on|eta\b|is\s+there|are\s+there|possible\s+to|ok\s+to|would\s+it\s+be|can\s+(?:someone|anyone)|does\s+(?:someone|anyone)\s+know|(?:can|could|should|shall|would|will|do|does|did|have|has|had|may|might|must)\s+(?:you|we|they|he|she|it|i|there|someone|anyone))\b/iu;
export const BLOCKQUOTE_REGEX = /(^|\n)>\s?.*(?=\n|$)/g;
export const RC_QUOTE_MARKUP_REGEX = /!\[:Quote\]\([^)]+\)/g;
export const PICK_REGEX = /^\s*pick\s+(\d+)\s*$/i;
export const MENTION_ID_REGEX = /<@([A-Za-z0-9._-]+)>/g;
export const NAME_REGEX = /@([^\s<>@][^\s<>@]*)/g;
export const HEADS_TAILS_REGEX = /^flip(\s+(heads|tails))?$/i;

export const ROAST_FALLBACKS = [
  '{target}, I’ve seen 404 pages with more direction.',
  '{target}, your code has more bugs than a nature documentary.',
  "{target}, if procrastination were a sport, you'd miss the signup deadline.",
  "{target}, your 'quick fix' just opened a portal to production issues.",
  '{target}, even your rubber duck asked for a reassignment.',
  '{target}, you’re the human equivalent of a missing semicolon in prod.',
  '{target}, I’d explain it to you, but I left my crayons at home.',
  '{target}, your confidence is inversely proportional to your unit tests.',
  '{target}, I’ve met commit messages with more clarity.',
  '{target}, if common sense were RAM, you’d be out of memory.',
];
