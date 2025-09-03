import OpenAI from 'openai';
import {
  extractJson,
  heuristicIsQuestion,
  pickFrom,
} from '../utils/generalUtils';
import { APP_CONFIG } from '../config';
import { ROAST_FALLBACKS } from '../constants';
import { AI_LIMIT, buildList, trim } from '../utils/webhookUtils';

export const openai = new OpenAI({ apiKey: APP_CONFIG.OPENAI_API_KEY });
const MODEL = APP_CONFIG.OPENAI_MODEL;
const MAXTOK_CLASSIFY = APP_CONFIG.OAI_MAXTOK_CLASSIFY;
const MAXTOK_ANSWER = APP_CONFIG.OAI_MAXTOK_ANSWER;
const TEMP_CLASSIFY = APP_CONFIG.OAI_TEMP_CLASSIFY;
const TEMP_ANSWER = APP_CONFIG.OAI_TEMP_ANSWER;

function getResponseContent(
  chatGPTResponse: OpenAI.Chat.Completions.ChatCompletion,
): string {
  if (!chatGPTResponse?.choices?.length) return '';
  return chatGPTResponse.choices[0]?.message?.content ?? '';
}

// ---- “Is this a question?” classifier → { isQuestion, reason } ----
export async function classifyQuestion(text: string) {
  const fallback = heuristicIsQuestion(text);
  const response = await AI_LIMIT(() =>
    openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Classify if the user text is a question. Respond as JSON with keys: {"is_question": boolean, "reason": string}.',
        },
        { role: 'user', content: `text: ${text.slice(0, 220)}` },
      ],
      max_tokens: MAXTOK_CLASSIFY,
      temperature: TEMP_CLASSIFY,
      stream: false,
    }),
  );

  const json = extractJson(getResponseContent(response));
  if (json && typeof json.is_question !== 'undefined') {
    return {
      isQuestion: !!json.is_question,
      reason: String(json.reason || ''),
    };
  }
  return { isQuestion: fallback, reason: 'heuristic fallback' };
}

// ---- Direct “read history and decide” → { duplicate, confidence, reply } ----
export async function answerFromHistoryDirect(
  newMsg: string,
  history: Array<{ author: string; when: string; text: string }>,
) {
  const list = buildList(history, 16);
  const response = await AI_LIMIT(() =>
    openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Decide if the NEW_QUESTION is already answered by RECENT_MESSAGES [1..N]. ' +
            'Set duplicate=true only if at least one prior message gives a clear answer (yes/no or specific fact). ' +
            'Reply JSON with keys: {"duplicate": boolean, "confidence": number, "reply": string, "evidence": number[]}. ' +
            'If duplicate, make reply 1–3 concise sentences and include at least one [index] with author and timestamp and a short quote.',
        },
        {
          role: 'user',
          content: `NEW_QUESTION:\n${newMsg.slice(0, 220)}\n\nRECENT_MESSAGES (newest first):\n${list}`,
        },
      ],
      max_tokens: MAXTOK_ANSWER,
      temperature: TEMP_ANSWER,
      stream: false,
    }),
  );

  const json = extractJson(getResponseContent(response)) || {};
  return {
    duplicate: !!json.duplicate,
    confidence: Number(json.confidence ?? 0),
    reply: String(json.reply || ''),
  };
}

/**
 * Generate a single PG roast line for a target.
 * Pass a RingCentral mention (e.g., "<@12345>") or a plain name.
 * @param target - e.g., "<@12345>" or "Taylor"
 * @param opts.style - "gentle" | "spicy" (defaults to "gentle")
 * @param opts.topic - optional context to flavor the roast (short text)
 */
export async function generateRoast(
  target?: string,
  opts?: { style?: 'gentle' | 'spicy'; topic?: string },
): Promise<string> {
  const style = opts?.style ?? 'gentle';
  const topic = opts?.topic ? trim(opts.topic, 220) : '';

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a playful roast generator for a friendly group chat. ' +
            'Rules: Keep it PG-rated, no profanity, no slurs, no references to protected classes ' +
            '(race, religion, gender, sexual orientation, disability, etc.), no threats, no doxxing. ' +
            'Keep it light and humorous. 1 sentence only. Address the target directly. ' +
            'Output ONLY the roast line; do not add quotes or extra commentary.',
        },
        {
          role: 'user',
          content:
            `Target: ${target}\n` +
            (topic ? `Context: ${topic}\n` : '') +
            `Style: ${style}\n` +
            'Write exactly one witty roast line that mentions the target. ' +
            'If you use a placeholder, replace it with the target string directly.',
        },
      ],
      max_tokens: Math.min(80, Number(MAXTOK_ANSWER ?? 120)),
      temperature: Number(TEMP_ANSWER ?? 0.8),
      stream: false,
    });

    const line = getResponseContent(response).trim();
    if (line) return line;
    return pickFrom(ROAST_FALLBACKS).replace('{target}', target ?? 'Curtis');
  } catch {
    return pickFrom(ROAST_FALLBACKS).replace('{target}', target ?? 'Curtis');
  }
}
