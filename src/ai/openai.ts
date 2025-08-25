import OpenAI from 'openai';
import { extractJson, heuristicIsQuestion } from '../utils';
import { APP_CONFIG } from '../config';

export const openai = new OpenAI({ apiKey: APP_CONFIG.OPENAI_API_KEY });
const MODEL = APP_CONFIG.OPENAI_MODEL;
const MAXTOK_CLASSIFY = APP_CONFIG.OAI_MAXTOK_CLASSIFY;
const MAXTOK_ANSWER = APP_CONFIG.OAI_MAXTOK_ANSWER;
const TEMP_CLASSIFY = APP_CONFIG.OAI_TEMP_CLASSIFY;
const TEMP_ANSWER = APP_CONFIG.OAI_TEMP_ANSWER;

// ---- Small helpers ----
function getContent(r: OpenAI.Chat.Completions.ChatCompletion): string {
  if (!r?.choices?.length) return '';
  return r.choices[0]?.message?.content ?? '';
}

// keep inputs modest to avoid length finishes
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

// ---- Embeddings ----
export async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return r.data[0].embedding;
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
          '- An answer is a yes/no or a clear declarative statement (dates, counts, “we are off …”, etc.).\n' +
          '- Do NOT cite the question itself as evidence.\n' +
          '- Keep reply 1–3 short sentences.\n' +
          '- The "reply" MUST include at least one [index] citation AND the author name AND date/time for a cited item, e.g. “… (Aug 24, 10:12 PM, Alice)”.\n' +
          'Return ONLY JSON (no prose) with keys exactly:\n' +
          '{"duplicate": boolean, "confidence": number, "reply": string, "evidence": number[]}',
      },
      {
        role: 'user',
        content:
          `QUESTION:\n${newMsg.slice(0, 500)}\n\n` +
          'RECENT MESSAGES (newest first):\n' +
          list,
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
