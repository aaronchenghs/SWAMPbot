// src/autoanswer/engine.ts
import { classifyQuestion, answerFromHistoryDirect } from '../ai/openai';
import { recentInChat, type MsgRow } from '../store/history';

const LOOKBACK_DAYS = Number(process.env.DEDUP_LOOKBACK_DAYS || '7');
const MIN_CONF = Number(process.env.DEDUP_MIN_CONFIDENCE || '0.65');

export async function indexIncoming(m: MsgRow) {
  // keep your existing “store to DB” path; embeddings optional
  // if you still want vectors for other features, leave as-is elsewhere
}

export async function maybeAutoReply(
  newMsg: MsgRow,
  post: (text: string) => Promise<void>,
) {
  const text = (newMsg.text || '').trim();
  if (!text) return;

  // Light gate to save tokens
  const looksLikeQuestion =
    /[?]|^\s*(who|what|why|where|when|how|can|should|do|does|did|is|are)\b/i.test(
      text,
    );
  if (!looksLikeQuestion) return;

  // Cheap classifier (optional but helps reduce calls)
  const cls = await classifyQuestion(text);
  if (!cls.isQuestion) return;

  // Pull recent chat text
  const since = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const recent = recentInChat(newMsg.chatId, since);
  if (!recent.length) return;

  // Build “history” for the model (newest first so [1] is most recent)
  const history = recent
    .filter((r) => r.id !== newMsg.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40) // keep it tight
    .map((r) => ({
      author: r.authorName || r.authorId || 'unknown',
      when: new Date(r.createdAt).toLocaleString(),
      text: r.text,
    }));

  const decision = await answerFromHistoryDirect(text, history);
  if (decision.duplicate && decision.confidence >= MIN_CONF && decision.reply) {
    await post(
      `I think we covered this recently. Here's the recap:\n\n${decision.reply}\n\n` +
        `(auto-reply; say “@${process.env.BOT_NAME || 'swampbot'} ignore” to disable in this chat)`,
    );
  }
}
