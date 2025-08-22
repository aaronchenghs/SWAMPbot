import { platform } from '../services/ringcentral.service';
import type { RcId } from '../commands/types';

const cache = new Map<string, string>();

function pickName(p: any): string | undefined {
  return (
    p?.name ||
    [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() ||
    p?.email ||
    undefined
  );
}

/** Resolve a RingCentral person display name by id; caches results in-memory. */
export async function resolveDisplayName(
  id: RcId,
): Promise<string | undefined> {
  const key = String(id);
  if (cache.has(key)) return cache.get(key);

  // Try new Team Messaging endpoint
  try {
    const r = await platform.get(`/team-messaging/v1/persons/${key}`);
    const p = await r.json();
    const name = pickName(p);
    if (name) {
      cache.set(key, name);
      return name;
    }
  } catch (_) {}

  try {
    const r = await platform.get(`/glip/persons/${key}`);
    const p = await r.json();
    const name = pickName(p);
    if (name) {
      cache.set(key, name);
      return name;
    }
  } catch (_) {}

  return undefined;
}
