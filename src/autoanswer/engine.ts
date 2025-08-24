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

// Keep messages short to avoid length finishes (gpt-5-nano burns “reasoning” tokens)
function trim(s: string, max = 160) {
  s = s || '';
  if (s.length <= max) return s;
  const head = s.slice(0, Math.floor(max * 0.7));
  const tail = s.slice(-Math.floor(max * 0.25));
  return `${head}\n...\n${tail}`;
}

function buildList(
  msgs: Array<{ author: string; when: string; text: string }>,
  maxItems = Number(process.env.DEDUP_LIST_MAX || '8'),
) {
  const pruned = msgs.slice(0, maxItems);
  return pruned
    .map((m, i) => `[${i + 1}] ${m.when} — ${m.author}: ${trim(m.text)}`)
    .join('\n');
}

// Prefer tool-call JSON when available
type Choice = OpenAI.Chat.Completions.ChatCompletion['choices'][number];
type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
type FnToolCall = Extract<ToolCall, { type: 'function' }>;

function firstToolJSON(choice?: Choice): any | null {
  const calls = choice?.message?.tool_calls;
  if (!Array.isArray(calls) || !calls.length) return null;
  const fn = calls.find(
    (c): c is FnToolCall => c?.type === 'function' && !!(c as any).function,
  );
  const args = (fn as any)?.function?.arguments;
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
      { role: 'user', content: `Text:\n${text.slice(0, 600)}` },
    ],
    // Keep reply tiny; let it spend fewer “reasoning” tokens
    ...({ max_completion_tokens: 48, reasoning: { effort: 'low' } } as any),
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
 * Uses a function-tool to force JSON quickly, + low reasoning.
 */
export async function answerFromHistoryDirect(
  newMsg: string,
  history: Array<{ author: string; when: string; text: string }>,
) {
  const list = buildList(history);

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You detect duplicate questions by scanning RECENT MESSAGES and produce a concise recap.\n' +
          'Only use information explicitly stated in RECENT MESSAGES. Do not invent facts.\n' +
          'Return ONLY via the provided tool/function.',
      },
      {
        role: 'user',
        content:
          `QUESTION:\n${newMsg.slice(0, 480)}\n\n` +
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
    // Make it answer fast: small budget + lower reasoning so it doesn’t run out before JSON
    ...({ max_completion_tokens: 96, reasoning: { effort: 'low' } } as any),
    stream: false,
  });

  // 1) Prefer the tool-call JSON (content may be empty by design)
  const choice = resp.choices?.[0];
  const toolJson = firstToolJSON(choice);
  if (toolJson) {
    return {
      duplicate: !!toolJson.duplicate,
      confidence: Number(toolJson.confidence ?? 0),
      reply: String(toolJson.reply || ''),
    };
  }

  // 2) If no tool-call, try content JSON
  const json = extractJson(getContent(resp)) || {};

  // 3) Tiny deterministic fallback for “who … needs help”
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
