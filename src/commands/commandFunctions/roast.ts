import { Command } from '../types';
import { generateRoast } from '../../ai/openai';

function stripLeadingMentions(s: string) {
  // Removes one or more leading mentions like "<@id>" or "@Name" (no assumption on platform)
  return s.replace(/^(\s*(<@[^>]+>|@\S+))+/, '').trim();
}

export const roastCommand: Command = {
  name: 'roast',
  description: 'Roast a tagged user',
  usage: 'roast',
  // Allow "@Bot roast ..." or "roast ..."
  matches: (text) => {
    const cleaned = stripLeadingMentions(text || '');
    return /^roast\b/i.test(cleaned);
  },
  async run(ctx) {
    const text1 = ctx.text;    

    await ctx.reply(`🔥 ${text1}`);
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
