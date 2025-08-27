import OpenAI from 'openai';
import {
  extractJson,
  heuristicIsQuestion,
  pickFrom,
} from '../utils/generalUtils';
import { APP_CONFIG } from '../config';

export const openai = new OpenAI({ apiKey: APP_CONFIG.OPENAI_API_KEY });
const MODEL = APP_CONFIG.OPENAI_MODEL;
const MAXTOK_CLASSIFY = APP_CONFIG.OAI_MAXTOK_CLASSIFY;
const MAXTOK_ANSWER = APP_CONFIG.OAI_MAXTOK_ANSWER;
const TEMP_CLASSIFY = APP_CONFIG.OAI_TEMP_CLASSIFY;
const TEMP_ANSWER = APP_CONFIG.OAI_TEMP_ANSWER;

function getContent(
  chatGPTResponse: OpenAI.Chat.Completions.ChatCompletion,
): string {
  if (!chatGPTResponse?.choices?.length) return '';
  return chatGPTResponse.choices[0]?.message?.content ?? '';
}

function trim(s: string, max = 220) {
  s = s || '';
  if (s.length <= max) return s;
  const head = s.slice(0, Math.floor(max * 0.7));
  const tail = s.slice(-Math.floor(max * 0.25));
  return `${head}\n...\n${tail}`;
}

function buildList(
  msgs: Array<{ author: string; when: string; text: string }>,
  maxItems = 16,
) {
  const pruned = msgs.slice(0, maxItems);
  return pruned
    .map((m, i) => `[${i + 1}] ${m.when} — ${m.author}: ${trim(m.text)}`)
    .join('\n');
}

export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return response.data[0].embedding;
}

// ---- “Is this a question?” classifier → { isQuestion, reason } ----
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Return ONLY a compact JSON object with keys exactly: ' +
          '{"is_question": boolean, "reason": string}. No other text.',
      },
      { role: 'user', content: `Text:\n${text.slice(0, 700)}` },
    ],
    max_tokens: MAXTOK_CLASSIFY,
    temperature: TEMP_CLASSIFY,
    stream: false,
  });

  const json = extractJson(getContent(r));
  if (json && typeof json.is_question !== 'undefined') {
    return {
      isQuestion: !!json.is_question,
      reason: String(json.reason || ''),
    };
  }
  return { isQuestion: fallback, reason: 'heuristic fallback' };
}

// ---- Direct “read history and decide” → { duplicate, confidence, reply } ----
export async function answerFromHistoryDirect(
  newMsg: string,
  history: Array<{ author: string; when: string; text: string }>,
) {
  const list = buildList(history, 16);
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You detect duplicate Q&A by scanning RECENT MESSAGES and produce a concise recap.\n' +
          'Rules:\n' +
          '- Only set duplicate=true if at least ONE prior message clearly ANSWERS the question (not another question).\n' +
          '- An answer is a yes/no, implication of an answer, or a clear declarative statement (dates, counts, “we are off …”, etc.).\n' +
          '- Do NOT cite the question itself as evidence.\n' +
          '- Keep reply 1–4 concise sentences.\n' +
          '- The "reply" MUST include at least one [index] citation AND the author name AND date/time for a cited item, e.g. “… (Aug 24, 10:12 PM, Alice)”.\n' +
          '- After the timestamp, quote the actual message you got the answer from.\n' +
          'Return ONLY JSON (no prose) with keys exactly:\n' +
          '{"duplicate": boolean, "confidence": number, "reply": string, "evidence": number[]}',
      },
      {
        role: 'user',
        content:
          `QUESTION:\n${newMsg.slice(0, 500)}\n\n` +
          'RECENT MESSAGES (newest first):\n' +
          list +
          '\n\n' +
          'Rules:\n' +
          '- If any message clearly answers the question (e.g., says who/what/when OR a yes/no), set duplicate=true.\n' +
          '- Include author/date in reply if possible, along with the quote of the referenced answer.\n' +
          '- Keep reply to 1–3 short sentences.\n' +
          '- If not clearly answered, set duplicate=false and reply empty.',
      },
    ],
    max_tokens: MAXTOK_ANSWER,
    temperature: TEMP_ANSWER,
    stream: false,
  });

  const json = extractJson(getContent(response)) || {};
  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}

const ROAST_FALLBACKS = [
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

/**
 * Generate a single PG roast line for a target.
 * Pass a RingCentral mention (e.g., "<@12345>") or a plain name.
 * @param target - e.g., "<@12345>" or "Taylor"
 * @param opts.style - "gentle" | "spicy" (defaults to "gentle")
 * @param opts.topic - optional context to flavor the roast (short text)
 */
export async function generateRoast(
  target?: string,
  opts?: { style?: 'gentle' | 'spicy'; topic?: string },
): Promise<string> {
  const style = opts?.style ?? 'gentle';
  const topic = opts?.topic ? trim(opts.topic, 220) : '';

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a playful roast generator for a friendly group chat. ' +
            'Rules: Keep it PG-rated, no profanity, no slurs, no references to protected classes ' +
            '(race, religion, gender, sexual orientation, disability, etc.), no threats, no doxxing. ' +
            'Keep it light and humorous. 1 sentence only. Address the target directly. ' +
            'Output ONLY the roast line; do not add quotes or extra commentary.',
        },
        {
          role: 'user',
          content:
            `Target: ${target}\n` +
            (topic ? `Context: ${topic}\n` : '') +
            `Style: ${style}\n` +
            'Write exactly one witty roast line that mentions the target. ' +
            'If you use a placeholder, replace it with the target string directly.',
        },
      ],
      max_tokens: Math.min(80, Number(MAXTOK_ANSWER ?? 120)),
      temperature: Number(TEMP_ANSWER ?? 0.8),
      stream: false,
    });

    const line = getContent(response).trim();
    if (line) return line;

    // Fallback to a local line if the model returned nothing
    return pickFrom(ROAST_FALLBACKS).replace('{target}', target ?? 'Curtis');
  } catch {
    // Network / API error fallback
    return pickFrom(ROAST_FALLBACKS).replace('{target}', target ?? 'Curtis');
  }
}
