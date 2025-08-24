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

/* -------------------------------- utilities -------------------------------- */

function getContent(r: OpenAI.Chat.Completions.ChatCompletion): string {
  return r.choices?.[0]?.message?.content ?? '';
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
  console.log('Classifying question:', text.slice(0, 100));

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL, // "gpt-5-nano"
    messages: [
      {
        role: 'system',
        content:
          'Decide if the user text is a question or implies a question that needs an answer.',
      },
      { role: 'user', content: text.slice(0, 1500) },
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
    ...({ max_completion_tokens: 120 } as any),
    stream: false,
  });

  // Prefer structured tool JSON
  const choice = resp.choices?.[0];
  const toolJson = parseFirstToolCallJSON(choice);
  if (toolJson) {
    console.log('Classify (tool):', toolJson);
    return {
      isQuestion: !!toolJson.is_question,
      reason: String(toolJson.reason || ''),
    };
  }

  // Fallback to content-based JSON, then heuristic
  const content = choice?.message?.content ?? '';
  if (content) {
    const json = extractJson(content);
    console.log('Classify (content):', json);
    if (json && typeof json.is_question !== 'undefined') {
      return {
        isQuestion: !!json.is_question,
        reason: String(json.reason || ''),
      };
    }
  }

  console.warn('Classify: no JSON returned; using heuristic.');
  return { isQuestion: fallback, reason: 'heuristic fallback' };
}

/* ----------------------- duplicate detection / drafting ---------------------- */
/** Summarize related history into a short auto-reply */
export async function draftAnswer(
  newMsg: string,
  hits: Array<{ author: string; when: string; text: string }>,
) {
  const related = hits
    .map((h, i) => `[${i + 1}] ${h.when} — ${h.author}: ${h.text}`)
    .join('\n');

  const example = `
EXAMPLE
NEW MESSAGE:
"is the new car green?"

RELATED HISTORY:
[1] 2025-08-24 22:11 — Alice: is the new car green?
[2] 2025-08-24 22:12 — Bob: yes, the new car is green

EXPECTED JSON:
{"duplicate": true, "confidence": 0.9, "reply": "Yes — earlier [2] confirmed “the new car is green” (Aug 24, 10:12 PM, Bob)."}
END EXAMPLE
  `.trim();

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL, // keep consistent with your config (e.g., "gpt-5-nano")
    messages: [
      {
        role: 'system',
        content:
          'You prevent repeated Q&A by checking recent chat history. ' +
          'If prior messages already contain a direct answer to the NEW MESSAGE, ' +
          'return duplicate=true with a short recap including a quoted snippet, date/time, and author.\n' +
          'Be decisive when a clear answer exists (e.g., “yes/no”, or a direct statement that resolves the question).\n' +
          'Return only via the tool/function with JSON — no prose.',
      },
      { role: 'user', content: example },
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
    ...({ max_completion_tokens: 200 } as any),
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
