export function getRandomGreeting(displayName?: string) {
  const name = displayName || 'friend';
  const quips = [
    `Howdy, ${name}! I only bite stale JIRA tickets 🐊`,
    `oh hi ${name} 👋 — did someone say banger?`,
    `Hello ${name}! Today's vibe check: ship > perfect.`,
    `hey ${name} — if code compiles, it ships. that's the law.`,
    `sup ${name}. i heard you like bots so i put a bot in your chat 🤖`,
    `Greetings ${name}! I run on caffeine and optimistic typing.`,
  ];
  return quips[Math.floor(Math.random() * quips.length)];
}
