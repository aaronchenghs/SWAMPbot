import OpenAI from 'openai';
import { OPENAI_MODEL } from '../constants';
import { extractJson, heuristicIsQuestion } from '../utils';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function getContent(r: OpenAI.Chat.Completions.ChatCompletion): string {
  if (!r?.choices?.length) return '';
  const c = r.choices[0];
  if (!c?.message?.content) {
  }
  return c?.message?.content ?? '';
}

function trimForModel(s: string, max = 1000) {
  s = s || '';
  if (s.length <= max) return s;
  const head = s.slice(0, Math.floor(max * 0.65));
  const tail = s.slice(-Math.floor(max * 0.3));
  return `${head}\n...\n${tail}`;
}

// Build a compact list the model can scan
function buildRelated(
  hits: Array<{ author: string; when: string; text: string }>,
  maxItems = 8,
) {
  const pruned = hits.slice(0, maxItems);
  return pruned
    .map(
      (h, i) =>
        `[${i + 1}] ${h.when} — ${h.author}: ${trimForModel(h.text, 280)}`,
    )
    .join('\n');
}

/** Heuristic fallback if the model returns no JSON */
function heuristicDuplicateDecision(
  newMsg: string,
  hits: Array<{ author: string; when: string; text: string }>,
) {
  const yesRe =
    /\b(yes|yep|yeah|confirmed|already|we did|we've done|done|shipped|deployed|it is|is|yessir)\b/i;
  const noRe =
    /\b(no|nope|not yet|haven't|didn't|tbd|unknown|not really|isn['’]t|is not)\b/i;

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const t = (h.text || '').toLowerCase();
    if (yesRe.test(t)) {
      return {
        duplicate: true,
        confidence: 0.82,
        reply: `Yes — earlier [${i + 1}] confirmed it (“${trimForModel(
          h.text,
          120,
        )}”, ${h.when}, ${h.author}).`,
      };
    }
    if (noRe.test(t)) {
      return {
        duplicate: true,
        confidence: 0.8,
        reply: `No — earlier [${i + 1}] indicated it hasn’t happened (“${trimForModel(
          h.text,
          120,
        )}”, ${h.when}, ${h.author}).`,
      };
    }
  }
  return { duplicate: false, confidence: 0, reply: '' };
}

/* -------------------------------- embeddings -------------------------------- */
export async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return r.data[0].embedding;
}

/* --------------------------- question classification -------------------------- */
/** “is this a question?” → { isQuestion, reason } */
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  const userText = trimForModel(text, 600);

  // For gpt-5-nano: content-JSON only. Tools tend to return empty content with length finish.
  const r = await openai.chat.completions.create({
    model: OPENAI_MODEL, // e.g., "gpt-5-nano-2025-08-07"
    messages: [
      {
        role: 'system',
        content:
          'Return ONLY a compact JSON object with keys exactly: ' +
          '{"is_question": boolean, "reason": string}. No other text.',
      },
      { role: 'user', content: `Text:\n${userText}` },
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

  // Last resort
  return { isQuestion: fallback, reason: 'heuristic fallback' };
}

/* ----------------------- duplicate detection / drafting ---------------------- */
/**
 * Decide if prior messages already answer NEW MESSAGE.
 * Returns { duplicate, confidence (0..1), reply }.
 * Strategy for gpt-5-nano:
 *  - Content-JSON only (no tools).
 *  - Very short rubric.
 *  - If still empty, use deterministic heuristic.
 */
export async function draftAnswer(
  newMsg: string,
  hits: Array<{ author: string; when: string; text: string }>,
) {
  const related = buildRelated(hits, 8);
  const compactNew = trimForModel(newMsg, 480);

  const rubric = `
RUBRIC:
- If any related message clearly answers the question (yes/no or direct statement), set duplicate=true with confidence >= 0.75.
- Tolerate typos and phrasing drift (“yeah we deployed” == “yes”).
- Prefer the most direct, recent answer; include [index] citation(s), author, and date/time.
- Keep reply to 1–3 short sentences.
- If no clear answer, set duplicate=false.
`.trim();

  const r = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Return ONLY a compact JSON object with keys exactly: ' +
          '{"duplicate": boolean, "confidence": number, "reply": string}. No other text.',
      },
      { role: 'user', content: rubric },
      {
        role: 'user',
        content: `NEW:\n${compactNew}\n\nRELATED (most relevant first):\n${related}`,
      },
    ],
    ...({ max_completion_tokens: 160 } as any),
    stream: false,
  });

  const json = extractJson(getContent(r));
  if (json && typeof json.duplicate !== 'undefined') {
    return {
      duplicate: !!json.duplicate,
      confidence: Number(json.confidence ?? 0),
      reply: String(json.reply || ''),
    };
  }

  // Deterministic fallback so you still get a useful answer
  return heuristicDuplicateDecision(newMsg, hits);
}
