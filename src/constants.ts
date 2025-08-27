export const BOT_ID = '4865606044';
export const GREETING_REGEX = /\b(hi|hello|hey|howdy|yo|sup)\b/i;
export const MENTIONS_MARKUP_REGEX = /!\[:[^\]]+\]\([^)]+\)/g;
export const QUESTION_REGEX =
  /[?？‽]|^\s*(?:[@\w.-]+[:,-]?\s*)*(?:what(?:'|’)?s|who(?:'|’)?s|where(?:'|’)?s|when(?:'|’)?s|why(?:'|’)?s|how(?:'|’)?s|how\s+to|what|why|where|when|who|whom|whose|which|whether|any\s+(?:updates?|chance|idea|ideas|way\s+to)|status\s+on|eta\b|is\s+there|are\s+there|possible\s+to|ok\s+to|would\s+it\s+be|can\s+(?:someone|anyone)|does\s+(?:someone|anyone)\s+know|(?:can|could|should|shall|would|will|do|does|did|have|has|had|may|might|must)\s+(?:you|we|they|he|she|it|i|there|someone|anyone))\b/iu;
export const BLOCKQUOTE_REGEX = /(^|\n)>\s?.*(?=\n|$)/g;
export const RC_QUOTE_MARKUP_REGEX = /!\[:Quote\]\([^)]+\)/g;
