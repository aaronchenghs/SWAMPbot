import { classifyQuestion, answerFromHistoryDirect } from '../ai/openai';
import { APP_CONFIG } from '../config';
import { QUESTION_REGEX } from '../constants';
import { resolveDisplayName } from '../services/names.service';
import { addMessage, recentInChat, type MsgRow } from '../store/history';
import { getRandomDeadupLead, isLikelyId } from '../utils/generalUtils';
import { formatTime } from '../utils/timeUtils';
import { embed, formatMention } from '../utils/webhookUtils';

const LOOKBACK_DAYS = APP_CONFIG.DEDUP_LOOKBACK_DAYS;
const MIN_CONF = APP_CONFIG.DEDUP_MIN_CONFIDENCE;

/** Index a message (text + embedding) for later recall */
export async function indexIncoming(message: MsgRow) {
  const text = (message.text || '').trim();
  if (!text) return;

  setImmediate(() => {
    try {
      addMessage(
        {
          ...message,
          text,
        },
        [],
      );
    } catch (e) {
      console.error('indexIncoming addMessage failed', e);
    }
  });
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
          when: formatTime(response.createdAt),
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
        when: formatTime(response.createdAt),
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
