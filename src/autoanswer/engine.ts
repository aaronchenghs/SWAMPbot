import { embed, classifyQuestion, draftAnswer } from '../ai/openai';
import { QUESTION_REGEX } from '../constants';
import {
  addMessage,
  recentInChat,
  getVector,
  getReplies,
  type MsgRow,
} from '../store/history';
import { cosine } from '../store/similarity';

const LOOKBACK_DAYS = Number(process.env.DEDUP_LOOKBACK_DAYS || '14');
const TOPK = Number(process.env.DEDUP_TOPK || '5');
const MIN_SIM = Number(process.env.DEDUP_MIN_SIM || '0.83');
const MIN_CONF = Number(process.env.DEDUP_MIN_CONFIDENCE || '0.65');

export async function indexIncoming(m: MsgRow) {
  // Skip tiny / system-esque messages to save tokens
  if ((m.text || '').trim().length >= 8) {
    const v = await embed(m.text);
    addMessage(m, v);
  } else {
    addMessage(m, new Array(1536).fill(0));
  }
}

export async function maybeAutoReply(
  newMsg: MsgRow,
  post: (text: string) => Promise<void>,
) {
  // 1) Gate: quick heuristics before calling LLM
  const text = (newMsg.text || '').trim();
  if (!QUESTION_REGEX.test(text)) return;

  // 2) LLM classifier (cheap)
  const cls = await classifyQuestion(text);
  console.log('Classified as question?', cls.isQuestion);
  if (!cls.isQuestion) return;

  // 3) Semantic search in recent window
  const since = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const recents = recentInChat(newMsg.chatId, since);
  console.log(`Found ${recents.length} recent messages to compare.`);
  if (!recents.length) return;

  // Helper type + guard so TS keeps the element type after filtering nulls
  type Scored = { row: MsgRow; sim: number };
  const notNull = <T>(v: T | null | undefined): v is T => v != null;

  const qVec = await embed(text);

  const scored: Scored[] = recents
    .filter((r) => r.id !== newMsg.id)
    .map<Scored | null>((r) => {
      const vector = getVector(r.id);
      return vector ? { row: r, sim: cosine(qVec, vector) } : null;
    })
    .filter(notNull)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, TOPK)
    .filter((x) => x.sim >= MIN_SIM);

  console.log('scored:', scored);
  if (!scored.length) return;

  // 4) Build small evidence set: each hit + a couple replies (possible answers)
  const evidence: Array<{ author: string; when: string; text: string }> = [];
  for (const s of scored) {
    const row = s.row;
    evidence.push({
      author: row.authorName || row.authorId || 'unknown',
      when: new Date(row.createdAt).toLocaleString(),
      text: row.text,
    });
    const replies = getReplies(row.id, 2);
    for (const rep of replies) {
      evidence.push({
        author: rep.authorName || rep.authorId || 'unknown',
        when: new Date(rep.createdAt).toLocaleString(),
        text: rep.text,
      });
    }
  }

  console.log('evidence:', evidence);

  // 5) Ask LLM to decide + draft reply
  const draft = await draftAnswer(text, evidence);
  console.log('draft:', draft);
  if (draft.duplicate && draft.confidence >= MIN_CONF && draft.reply)
    await post(
      `I think we covered this recently. Here's the recap:\n\n${draft.reply}\n\n(auto-reply; say “@swampbot ignore” to disable in this chat)`,
    );
}
