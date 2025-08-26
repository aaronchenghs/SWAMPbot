import { classifyQuestion, answerFromHistoryDirect, embed } from '../ai/openai';
import { APP_CONFIG } from '../config';
import { QUESTION_REGEX } from '../constants';
import { resolveDisplayName } from '../services/names.service';
import { addMessage, recentInChat, type MsgRow } from '../store/history';
import { getRandomDeadupLead, isLikelyId } from '../utils/generalUtils';
import { formatWhen } from '../utils/timeUtils';
import { formatMention, PostOptions } from '../utils/webhookUtils';

const LOOKBACK_DAYS = APP_CONFIG.DEDUP_LOOKBACK_DAYS;
const MIN_CONF = APP_CONFIG.DEDUP_MIN_CONFIDENCE;

/** Index a message (text + embedding) for later recall */
export async function indexIncoming(m: MsgRow) {
  const t = (m.text || '').trim();
  if (t.length >= 8) {
    const v = await embed(t);
    addMessage(m, v);
  } else {
    addMessage(m, new Array(1536).fill(0));
  }
}

/**
 * If new message is likely a question and history already answers it,
 * auto-reply with a short recap + citations.
 */
export async function maybeAutoReply(
  newMsg: MsgRow,
  post: (text: string) => Promise<void>,
) {
  const text = (newMsg.text || '').trim();
  if (!text || !QUESTION_REGEX.test(text)) return;

  // Cheap classifier (reduces false positives before calling bigger prompt)
  const cls = await classifyQuestion(text);
  if (!cls.isQuestion) return;

  const since = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const recent = recentInChat(newMsg.chatId, since);
  if (!recent.length) return;

  const rows = recent
    .filter((row) => row.id !== newMsg.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);

  const history = await Promise.all(
    rows.map(async (response) => {
      if (response.authorName && !isLikelyId(response.authorName)) {
        return {
          author: response.authorName,
          when: formatWhen(response.createdAt),
          text: response.text,
        };
      }

      let name = response.authorName || 'unknown';
      if (response.authorId) {
        const resolved = await resolveDisplayName(
          response.authorId,
          newMsg.chatId,
        );
        if (resolved) name = resolved;
      }

      const author = !isLikelyId(name) ? name : 'someone';

      return {
        author,
        when: formatWhen(response.createdAt),
        text: response.text,
      };
    }),
  );

  const decision = await answerFromHistoryDirect(text, history);
  if (decision.duplicate && decision.confidence >= MIN_CONF && decision.reply) {
    const mention = formatMention(newMsg.authorId, newMsg.authorName);
    const lead = getRandomDeadupLead();
    await post(`**🔔 ${mention} ${lead}:**\n${decision.reply}`);
  }
}
