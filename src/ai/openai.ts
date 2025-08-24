// src/ai/openai.ts
import OpenAI from 'openai';
import { OPENAI_MODEL } from '../constants';
import { extractJson, heuristicIsQuestion } from '../utils';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/* ------------------------------- small helpers ------------------------------ */
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

export async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return r.data[0].embedding;
}

export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  const r = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Return ONLY a compact JSON object with keys exactly: ' +
          '{"is_question": boolean, "reason": string}. No other text.',
      },
      { role: 'user', content: `Text:\n${text.slice(0, 700)}` },
    ],
    ...({ max_completion_tokens: 64 } as any),
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

/* ---------------------- direct “read history and decide” --------------------- */
/**
 * Give the model the recent messages (no embeddings) and ask:
 *   - Is the new question already answered here?
 *   - If yes, produce a short recap with citation(s) like [2].
 */
export async function answerFromHistoryDirect(
  newMsg: string,
  history: Array<{ author: string; when: string; text: string }>,
) {
  const list = buildList(history, 16);
  console.log('Getting an answer from chatGPT...');
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You detect duplicate questions by scanning RECENT MESSAGES and produce a concise recap.\n' +
          'Only use information explicitly stated in RECENT MESSAGES. Do not invent facts.\n' +
          'Return ONLY JSON (no prose) with keys exactly:\n' +
          '{"duplicate": boolean, "confidence": number, "reply": string}',
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
          '- Include [index] citation(s) and author/date in reply.\n' +
          '- Keep reply to 1–3 short sentences.\n' +
          '- If not clearly answered, set duplicate=false and reply empty.',
      },
    ],
    ...({ max_completion_tokens: 140 } as any),
    stream: false,
  });
  console.log(response);
  console.log(response.choices);
  const json = extractJson(getContent(response)) || {};
  // Simple fallback for “who … ?” shape if model returns nothing
  if (
    (!json || typeof json.duplicate === 'undefined') &&
    /^\s*who\b/i.test(newMsg)
  ) {
    const whoHit = history.find((h) =>
      /\b([A-Z][a-zA-Z]+)\b.+\bneeds help\b/i.test(h.text),
    );
    if (whoHit) {
      const m = whoHit.text.match(/\b([A-Z][a-zA-Z]+)\b.+\bneeds help\b/i);
      const name = m?.[1];
      if (name) {
        return {
          duplicate: true,
          confidence: 0.8,
          reply: `${name} — see [${history.indexOf(whoHit) + 1}] (${whoHit.when}, ${whoHit.author}).`,
        };
      }
    }
  }

  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}
