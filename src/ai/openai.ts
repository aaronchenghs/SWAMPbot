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

/* -------------------------------- embeddings -------------------------------- */
export async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return r.data[0].embedding;
}

/* --------------------------- question classification -------------------------- */
/** Fast: “is this a question?” → { isQuestion, reason } */
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL, // "gpt-5-nano"
    messages: [
      {
        role: 'system',
        content:
          'Classify if the user text asks a question (or clearly implies one). ' +
          'Return ONLY via tool call. Keep reason under 15 words.',
      },
      { role: 'user', content: text.slice(0, 800) },
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
    ...({ max_completion_tokens: 48 } as any), // tiny cap so it can’t wander
    stream: false,
  });

  const choice = resp.choices?.[0];
  const toolJson = parseFirstToolCallJSON(choice);
  if (toolJson) {
    return {
      isQuestion: !!toolJson.is_question,
      reason: String(toolJson.reason || ''),
    };
  }

  // very rare fallback
  const content = choice?.message?.content ?? '';
  if (content) {
    const json = extractJson(content);
    if (json && typeof json.is_question !== 'undefined') {
      return {
        isQuestion: !!json.is_question,
        reason: String(json.reason || ''),
      };
    }
  }
  return { isQuestion: fallback, reason: 'heuristic fallback' };
}

/* ----------------------- duplicate detection / drafting ---------------------- */
/**
 * Given the new message and related history, decide if it’s a duplicate and
 * draft a 1–3 sentence recap with citation(s). We push a strict rubric and examples
 * so obvious re-asks (“is the new car green?” + “yes it is”) are marked duplicate.
 */
export async function draftAnswer(
  newMsg: string,
  hits: Array<{ author: string; when: string; text: string }>,
) {
  const related = hits
    .map((h, i) => `[${i + 1}] ${h.when} — ${h.author}: ${h.text}`)
    .join('\n');

  const examples = `
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

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL, // "gpt-5-nano"
    messages: [
      {
        role: 'system',
        content:
          'You detect duplicate questions by scanning recent chat history and produce a concise recap. ' +
          'Return ONLY via tool call with strict JSON.',
      },
      { role: 'user', content: examples },
      {
        role: 'user',
        content: `NEW MESSAGE:\n${newMsg}\n\nRELATED HISTORY (most relevant first):\n${related}`,
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

  const choice = resp.choices?.[0];
  const json = parseFirstToolCallJSON(choice) ?? {};

  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}
