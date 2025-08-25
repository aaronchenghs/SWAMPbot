import { platform } from './services/ringcentral.service';
import type { RcId, MentionSpec, Command } from './commands/types';
import { commands } from './commands';
import { APP_CONFIG } from './config';

export async function postText(
  chatId: RcId,
  text: string,
  opts?: { mentions?: ReadonlyArray<MentionSpec> },
) {
  const body: any = { text };
  if (opts?.mentions?.length) {
    body.mentions = opts.mentions.map((m) => ({
      id: String(m.id),
      type: m.type,
    }));
  }
  await platform.post(`/team-messaging/v1/chats/${chatId}/posts`, body);
}

/** Build a compact help message from registered commands */
export function helpMessage() {
  const lines = commands.map((c: Command) => {
    const names = [c.name, ...(c.aliases || [])].join(', ');
    const desc = c.description || '';
    const usage = c.usage ? ` — \`${c.usage}\`` : '';
    return `• **${names}** — ${desc}${usage}`;
  });
  return `🔍 Here’s what I can do:\n\n${lines.join('\n')}\n\nTip: mention me, then your command.`;
}

/** Extract a command text from cleaned content, removing the bot name when present */
export function extractCommandText(cleanText: string): string {
  const re = new RegExp(`\\b${APP_CONFIG.BOT_NAME}\\b`, 'i');
  return cleanText.replace(re, '').trim();
}

/** Match a command: prefer c.matches(text, ctx); fallback to name/alias == first token */
export function findCommand(text: string, ctx: any): Command | undefined {
  const tokens = text.split(/\s+/).filter(Boolean);
  const first = (tokens[0] || '').toLowerCase();

  // Try explicit matcher first
  for (const command of commands) {
    if (typeof command.matches === 'function') {
      try {
        if (command.matches(text, ctx as any)) return command;
      } catch {}
    }
  }
  // Fallback: token match to name/aliases
  return commands.find(
    (c) =>
      c.name.toLowerCase() === first ||
      (c.aliases || []).some((a) => a.toLowerCase() === first),
  );
}
