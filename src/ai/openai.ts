import OpenAI from 'openai';
import { OPENAI_MODEL } from '../constants';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function extractJson(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}

  // If the model wrapped JSON in code fences or extra prose, pull the largest {...} block.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return {};
}

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
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
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
    max_tokens: 150,
  });

  const json = extractJson(getContent(resp));
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
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You summarize internal chat history to prevent duplicate Q&A. ' +
          'Return STRICT JSON only with keys: ' +
          `{"duplicate": boolean, "confidence": number, "reply": string}. ` +
          'confidence is 0..1. "reply" is 1–4 concise sentences with short quotes + dates + author attribution.',
      },
      {
        role: 'user',
        content:
          `NEW MESSAGE:\n${newMsg}\n\n` +
          `RELATED HISTORY (most relevant first):\n${related}`,
      },
    ],
  });

  const json = extractJson(getContent(resp));
  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}
