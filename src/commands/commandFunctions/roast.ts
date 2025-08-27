import { Command } from '../types';
import { generateRoast } from '../../ai/openai';

function stripLeadingMentions(s: string) {
  // Removes one or more leading mentions like "<@id>" or "@Name" (no assumption on platform)
  return s.replace(/^(\s*(<@[^>]+>|@\S+))+/, '').trim();
}

export const roastCommand: Command = {
  name: 'roast',
  description: 'Roast a tagged user',
  usage: 'roast <@id> | roast @First Last',
  // Allow "@Bot roast ..." or "roast ..."
  matches: (text) => {
    const cleaned = stripLeadingMentions(text || '');
    return /^roast\b/i.test(cleaned);
  },
  async run(ctx) {
    const rawText = ctx.text || '';
    const cleaned = stripLeadingMentions(rawText);

    // drop the command word "roast" and any whitespace after it
    const afterCmd = cleaned.replace(/^roast\b\s*/i, '');

    // Prefer platform-provided mentions if available (RingCentral usually sets these)
    // Assumes ctx.mentions: Array<{ id: string, name?: string, isBot?: boolean }>
    const mentions = (ctx as any).mentions as Array<{ id: string; name?: string }> | undefined;

    // Find first mentioned user that isn't the bot
    let targetId: string | undefined;
    let targetDisplay: string | undefined;

    if (mentions?.length) {
      const botId = (ctx as any).botId ? String((ctx as any).botId) : undefined;
      const target = mentions.find(m => String(m.id) !== botId);
      if (target) {
        targetId = String(target.id);
        // Render mention in a way your platform understands; keep your existing <@id> format
        targetDisplay = `<@${targetId}>`;
      }
    }

    // Fallback: parse from the remaining text (supports <@id> and @First Last)
    if (!targetId) {
      const parsed = extractTaggedTargetLoose(afterCmd);
      if (parsed) {
        targetDisplay = parsed.mention;
        targetId = parsed.id;
      }
    }

    if (!targetDisplay) {
      await ctx.reply('Usage: roast <@id> or roast @First Last — tag someone to roast.');
      return;
    }

    // Don’t roast the bot itself
    if (targetId && (ctx as any).botId && String(targetId) === String((ctx as any).botId)) {
      await ctx.reply("Nice try, but I’m flameproof. Pick a human. 🔥");
      return;
    }

    const line = await generateRoast(targetDisplay, { style: 'gentle' });
    await ctx.reply(`🔥 ${line}`);
  },
};

function extractTaggedTargetLoose(text: string): { mention: string; id?: string } | null {
  // <@id> (Slack/RC formatted)
  const idMatch = text.match(/<@([A-Za-z0-9._-]+)>/);
  if (idMatch) {
    const id = String(idMatch[1]);
    return { mention: `<@${id}>`, id };
  }

  // @First Last (allow spaces until punctuation or end of line)
  // - starts with "@"
  // - then at least one non-space
  // - then optionally more words separated by single spaces
  const nameMatch = text.match(/@([^\s<>@]+(?:\s+[^\s<>@]+)*)/);
  if (nameMatch) {
    // Normalize multiple spaces
    const name = nameMatch[1].replace(/\s+/g, ' ').trim();
    return { mention: `@${name}` };
  }

  return null;
}
