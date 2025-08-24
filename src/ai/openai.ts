import OpenAI from 'openai';
import { OPENAI_MODEL } from '../constants';
import { extractJson, heuristicIsQuestion, parseToolCallJSON } from '../utils';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const firstContent = (r: OpenAI.Chat.Completions.ChatCompletion) =>
  r.choices?.[0]?.message?.content ?? '';

function getContent(r: OpenAI.Chat.Completions.ChatCompletion): string {
  return r.choices?.[0]?.message?.content ?? '';
}

export async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 4000),
  });
  return r.data[0].embedding;
}

/** Fast: “is this a question?” → { isQuestion, reason } */
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  console.log('Classifying question:', text.slice(0, 100));

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
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
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'set_result' } },
    ...({ max_completion_tokens: 120 } as any),
    stream: false,
  });

  // Prefer tool call JSON
  console.log('resp:', resp);
  const choice = resp.choices?.[0];
  const toolJson = parseToolCallJSON(choice);
  if (toolJson) {
    console.log('Classify (tool):', toolJson);
    return {
      isQuestion: !!toolJson.is_question,
      reason: String(toolJson.reason || ''),
    };
  }

  // If the model didn’t call the tool, fall back to your old text JSON parser OR heuristic
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

/** Summarize related history into a short auto-reply */
export async function draftAnswer(
  newMsg: string,
  hits: Array<{ author: string; when: string; text: string }>,
) {
  const related = hits
    .map((h, i) => `[${i + 1}] ${h.when} — ${h.author}: ${h.text}`)
    .join('\n');

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Summarize prior chat to avoid duplicate Q&A. Return STRICT JSON only: ' +
          '{"duplicate": true|false, "confidence": number, "reply": string}. ' +
          'confidence is 0..1. "reply" = 1–4 concise sentences with short quotes + dates + author.',
      },
      {
        role: 'user',
        content:
          `NEW MESSAGE:\n${newMsg}\n\n` +
          `RELATED HISTORY (most relevant first):\n${related}`,
      },
    ],
    ...({ max_completion_tokens: 220 } as any),
    stream: false,
  });

  const json = extractJson(firstContent(resp));
  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}
