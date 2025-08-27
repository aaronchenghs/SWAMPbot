import OpenAI from 'openai';
import { extractJson, heuristicIsQuestion } from '../utils/generalUtils';
import { APP_CONFIG } from '../config';

export const openai = new OpenAI({ apiKey: APP_CONFIG.OPENAI_API_KEY });
const MODEL = APP_CONFIG.OPENAI_MODEL;
const MAXTOK_CLASSIFY = APP_CONFIG.OAI_MAXTOK_CLASSIFY;
const MAXTOK_ANSWER = APP_CONFIG.OAI_MAXTOK_ANSWER;
const TEMP_CLASSIFY = APP_CONFIG.OAI_TEMP_CLASSIFY;
const TEMP_ANSWER = APP_CONFIG.OAI_TEMP_ANSWER;

// ---- Small helpers ----
function getContent(
  chatGPTResponse: OpenAI.Chat.Completions.ChatCompletion,
): string {
  if (!chatGPTResponse?.choices?.length) return '';
  return chatGPTResponse.choices[0]?.message?.content ?? '';
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
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return response.data[0].embedding;
}

// ---- “Is this a question?” classifier → { isQuestion, reason } ----
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
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
