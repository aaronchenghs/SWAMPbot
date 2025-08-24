// src/ai/openai.ts
import OpenAI from 'openai';
import { OPENAI_MODEL } from '../constants';
import { extractJson, heuristicIsQuestion } from '../utils';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/* ----------------------------- tool-call helpers ---------------------------- */
type Choice = OpenAI.Chat.Completions.ChatCompletion['choices'][number];
type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
type FnToolCall = Extract<ToolCall, { type: 'function' }>;

function isFnToolCall(tc: ToolCall | undefined): tc is FnToolCall {
  return !!tc && tc.type === 'function' && 'function' in tc;
}
function parseFirstToolCallJSON(choice?: Choice): any | null {
  const calls = choice?.message?.tool_calls;
  if (!Array.isArray(calls)) return null;
  const fn = calls.find(isFnToolCall);
  if (!fn) return null;
  const args = fn.function?.arguments;
  if (!args) return null;
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}

/* ------------------------------- small helpers ------------------------------ */
function getContent(r: OpenAI.Chat.Completions.ChatCompletion): string {
  console.log('Full response:', r);
  return r.choices?.[0]?.message?.content ?? '';
}

// keep inputs modest to avoid length finishes
function trimForModel(s: string, max = 1400) {
  s = s || '';
  if (s.length <= max) return s;
  // Keep head+tail; we rarely need the middle.
  const head = s.slice(0, Math.floor(max * 0.6));
  const tail = s.slice(-Math.floor(max * 0.35));
  return `${head}\n...\n${tail}`;
}

function buildRelated(
  hits: Array<{ author: string; when: string; text: string }>,
  maxItems = 8,
) {
  const pruned = hits.slice(0, maxItems);
  return pruned
    .map(
      (h, i) =>
        `[${i + 1}] ${h.when} — ${h.author}: ${trimForModel(h.text, 300)}`,
    )
    .join('\n');
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
/** “is this a question?” → { isQuestion, reason } with tool-call + retry JSON */
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  const userText = trimForModel(text, 800);

  // Pass 1: tool call
  const resp1 = await openai.chat.completions.create({
    model: OPENAI_MODEL, // e.g., "gpt-5-nano"
    messages: [
      {
        role: 'system',
        content:
          'Classify if the user text asks a question (or clearly implies one). ' +
          'Return ONLY via tool call. Keep reason under 15 words.',
      },
      { role: 'user', content: `Text:\n${userText}` },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'set_result',
          description: 'Return the classification result as JSON.',
          parameters: {
            type: 'object',
            properties: {
              is_question: { type: 'boolean' },
              reason: { type: 'string' },
            },
            required: ['is_question', 'reason'],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'set_result' } },
    ...({ max_completion_tokens: 64 } as any),
    stream: false,
  });

  const choice1 = resp1.choices?.[0];
  const toolJson1 = parseFirstToolCallJSON(choice1);
  if (toolJson1) {
    return {
      isQuestion: !!toolJson1.is_question,
      reason: String(toolJson1.reason || ''),
    };
  }

  // Pass 2: no tools — force raw JSON content
  const resp2 = await openai.chat.completions.create({
    model: OPENAI_MODEL,
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

  const json2 = extractJson(getContent(resp2));
  if (json2 && typeof json2.is_question !== 'undefined') {
    return {
      isQuestion: !!json2.is_question,
      reason: String(json2.reason || ''),
    };
  }

  // last resort
  return { isQuestion: fallback, reason: 'heuristic fallback' };
}

/* ----------------------- duplicate detection / drafting ---------------------- */
/**
 * Decide if prior messages already answer NEW MESSAGE.
 * Returns { duplicate, confidence (0..1), reply }.
 * Strategy:
 *  - Try tool-call with a tight rubric.
 *  - If no tool JSON, retry with content-JSON (no tools).
 */
export async function draftAnswer(
  newMsg: string,
  hits: Array<{ author: string; when: string; text: string }>,
) {
  const related = buildRelated(hits, 8);
  const compactNew = trimForModel(newMsg, 500);

  const rubric = `
RUBRIC:
- If any related message directly answers the question (e.g., “yes/no”, a definitive statement),
  set duplicate=true with confidence >= 0.75.
- Tolerate typos or phrasing drift (“teh” vs “the”, “yeah we deployed” == “yes we deployed”).
- Prefer the most direct, recent answer; include [index] citation(s), author, and date/time.
- Keep reply to 1–3 short sentences.
- If there is no clear answer, set duplicate=false.

ONE EXAMPLE
NEW:
"is the new car green?"
RELATED:
[1] 2025-08-24 22:11 — Alice: is teh new car green?
[2] 2025-08-24 22:12 — Bob: yes, the new car is green
EXPECTED:
{"duplicate": true, "confidence": 0.9, "reply": "Yes — earlier [2] confirmed “the new car is green” (Aug 24, 10:12 PM, Bob)."}
`.trim();

  // Pass 1: tool-call
  const resp1 = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You detect duplicate questions by scanning recent chat history and produce a concise recap. ' +
          'Return ONLY via tool call with strict JSON.',
      },
      { role: 'user', content: rubric },
      {
        role: 'user',
        content: `NEW MESSAGE:\n${compactNew}\n\nRELATED HISTORY (most relevant first):\n${related}`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'set_decision',
          description: 'Return the decision as strict JSON.',
          parameters: {
            type: 'object',
            properties: {
              duplicate: { type: 'boolean' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              reply: { type: 'string' },
            },
            required: ['duplicate', 'confidence', 'reply'],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'set_decision' } },
    ...({ max_completion_tokens: 128 } as any),
    stream: false,
  });

  console.log('resp1:', resp1);

  const choice1 = resp1.choices?.[0];
  let json = parseFirstToolCallJSON(choice1);

  // Pass 2: retry with content JSON if tool-call failed or empty
  if (!json) {
    const resp2 = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Return ONLY a compact JSON object with keys exactly: ' +
            '{"duplicate": boolean, "confidence": number, "reply": string}. No other text.',
        },
        {
          role: 'user',
          content:
            `NEW:\n${compactNew}\n\nRELATED (most relevant first):\n${related}\n\n` +
            'Decide per the rubric: mark duplicate=true when a prior message clearly answers the question (including “yes/no” phrasing).',
        },
      ],
      ...({ max_completion_tokens: 128 } as any),
      stream: false,
    });
    console.log('resp2:', resp2);
    json = extractJson(getContent(resp2)) ?? {};
  }

  console.log('draftAnswer JSON:', json);

  return {
    duplicate: !!json?.duplicate,
    confidence: Number(json?.confidence ?? 0),
    reply: String(json?.reply || ''),
  };
}
