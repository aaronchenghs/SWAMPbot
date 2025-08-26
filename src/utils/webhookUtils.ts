import { platform } from '../services/ringcentral.service';
import type { Command } from '../commands/types';
import { commands } from '../commands';
import { APP_CONFIG } from '../config';

export type PostOptions = {
  parentId?: string;
  quoteOfId?: string;
};

export async function postText(
  chatId: string,
  text: string,
  options?: PostOptions,
) {
  const body: any = { text };
  if (options?.parentId) body.parentId = options.parentId;
  if (options?.quoteOfId) body.quoteOfId = options.quoteOfId;
  await platform.post(`/team-messaging/v1/chats/${chatId}/posts`, body);
}

export function formatMention(
  authorId?: string | null,
  authorName?: string | null,
): string {
  const id = authorId?.toString().trim();
  if (id) return `![:Person](${id}) `;
  const name = authorName?.toString().trim();
  if (name) return `@${name} `;
  return 'friend';
}

/** Build a compact help message from registered commands */
export function buildHelpMessage() {
  const lines = commands.map((command: Command) => {
    const names = [command.name, ...(command.aliases || [])].join(', ');
    const desc = command.description || '';
    const usage = command.usage ? ` — \`${command.usage}\`` : '';
    return `• **${names}** — ${desc}${usage}`;
  });
  return `🔍 Here’s what I can do:\n\n${lines.join('\n')}\n\nTip: mention me, then your command (@SWAMPbot [command]).`;
}

/** Extract a command text from cleaned content, removing the bot name when present */
export function extractCommandText(cleanText: string): string {
  const re = new RegExp(`\\b${APP_CONFIG.BOT_NAME}\\b`, 'i');
  return cleanText.replace(re, '').trim();
}

/** Match a command: prefer c.matches(text, ctx); fallback to name/alias == first token */
export function lookUpCommand(text: string, ctx: any): Command | undefined {
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
    (command) =>
      command.name.toLowerCase() === first ||
      (command.aliases || []).some((a) => a.toLowerCase() === first),
  );
}
