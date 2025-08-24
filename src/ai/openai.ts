// src/ai/openai.ts
import OpenAI from 'openai';
import { DISCUSSION_EXAMPLE, OPENAI_MODEL } from '../constants';
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

  const examples = DISCUSSION_EXAMPLE;

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
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

  console.log('LLM full response:', resp);
  const choice = resp.choices?.[0];
  const json = parseFirstToolCallJSON(choice) ?? {};
  console.log('Parsed JSON:', json);

  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}
