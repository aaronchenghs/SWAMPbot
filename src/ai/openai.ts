import OpenAI from 'openai';
import { OPENAI_MODEL } from '../constants';
import { extractJson } from '../utils';

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
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a classifier. Output STRICT JSON only with keys: ' +
          `{"is_question": true|false, "reason": string}. No prose.`,
      },
      {
        role: 'user',
        content: `Text:\n${text.slice(0, 1500)}`,
      },
    ],
    ...({ max_completion_tokens: 150 } as any),
  });

  const json = extractJson(getContent(response));
  return {
    isQuestion: !!json.is_question,
    reason: String(json.reason || ''),
  };
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
