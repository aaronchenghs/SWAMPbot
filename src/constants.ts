export const BOT_ID = '4865606044';
export const OPENAI_MODEL = 'gpt-5-nano';
export const GREETING_REGEX = /\b(hi|hello|hey|howdy|yo|sup)\b/i;
export const MENTIONS_MARKUP_REGEX = /!\[:[^\]]+\]\([^)]+\)/g;
export const QUESTION_REGEX =
  /[?]|^\s*(how|what|why|where|when|who|is|are|can|should|could|does|do|did)\b/i;

export const DISCUSSION_EXAMPLE = `
RUBRIC:
- If any related message directly answers the question (e.g., "yes/no", or a definitive statement resolving it),
  set duplicate=true with confidence >= 0.75.
- Tolerate typos or minor wording differences ("teh" vs "the").
- Prefer the most direct, recent answer; include [index] citation(s), author, and date/time.
- Keep reply to 1–3 short sentences.
- If there is no clear answer, set duplicate=false.

EXAMPLE A
NEW MESSAGE:
"is the new car green?"
RELATED:
[1] 2025-08-24 22:11 — Alice: is teh new car green?
[2] 2025-08-24 22:12 — Bob: yes, the new car is green
EXPECTED:
{"duplicate": true, "confidence": 0.9, "reply": "Yes — earlier [2] confirmed “the new car is green” (Aug 24, 10:12 PM, Bob)."}

EXAMPLE B
NEW MESSAGE:
"When is the deploy?"
RELATED:
[1] 2025-08-24 09:02 — Sam: deploy is 3pm CT today
EXPECTED:
{"duplicate": true, "confidence": 0.85, "reply": "Deploy is at 3pm CT — see [1] (Sam, Aug 24, 9:02 AM)."}

EXAMPLE C
NEW MESSAGE:
"What’s our error budget?"
RELATED:
[1] 2025-08-20 — Pat: let’s ask SRE later
EXPECTED:
{"duplicate": false, "confidence": 0.2, "reply": ""}
`.trim();
