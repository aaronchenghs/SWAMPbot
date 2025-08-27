import { platform } from './ringcentral.service';

type Member = { id: string; type?: string; name?: string };
type MembersResponse = { records?: Member[] };

const nameByPersonId = new Map<string, string>();
const chatMembers = new Map<string, Map<string, string>>();
const MAX_NAME_CACHE = 1000;

function cacheName(personId: string, name: string) {
  if (!personId || !name) return;
  if (!nameByPersonId.has(personId) && nameByPersonId.size >= MAX_NAME_CACHE) {
    const firstKey = nameByPersonId.keys().next().value;
    if (firstKey) nameByPersonId.delete(firstKey);
  }
  nameByPersonId.set(personId, name);
}

async function fetchPersonName(personId: string): Promise<string | null> {
  try {
    const r = await platform.get(`/team-messaging/v1/persons/${personId}`);
    const json = await r.json();
    const name =
      (json?.name as string | undefined) ??
      [json?.firstName, json?.lastName].filter(Boolean).join(' ').trim();
    return name || null;
  } catch {
    return null;
  }
}

export async function ensureChatMembers(chatId: string): Promise<Map<string, string>> {
  const tag = '[ensureChatMembers]';

  console.log(`${tag} called with chatId=${chatId}`);

  const existing = chatMembers.get(chatId);
  if (existing) {
    console.log(`${tag} cache HIT for chatId=${chatId}; size=${existing.size}`);
    return existing;
  }

  console.log(`${tag} cache MISS for chatId=${chatId}; fetching members...`);

  const map = new Map<string, string>();
  try {
    const r = await platform.get(`/team-messaging/v1/chats/${chatId}/members`, {
      recordCount: '200',
    } as any);

    const json: MembersResponse = await r.json();
    const total = Array.isArray(json?.records) ? json.records.length : 0;
    console.log(`${tag} fetched records: ${total}`);

    let added = 0;
    for (const m of json.records || []) {
      if (m?.id) {
        const id = String(m.id);
        const display = m.name || '';
        if (display) {
          map.set(id, display);
          cacheName(id, display);
          added++;
        } else {
          console.log(`${tag} member ${id} has no display name; skipping`);
        }
      } else {
        console.log(`${tag} encountered record without id; skipping`);
      }
    }
    console.log(`${tag} added ${added} members to map`);
  } catch (e) {
    console.error(`${tag} ERROR fetching members for chatId=${chatId}`, e);
  }

  chatMembers.set(chatId, map);
  console.log(`${tag} cached map for chatId=${chatId}; size=${map.size}`);
  return map;
}

/**
 * Resolve a display name for the given person id.
 */
export async function resolveDisplayName(
  personId: string,
  chatId?: string,
  mentions?: Array<{ id?: string; name?: string }>,
): Promise<string> {
  if (!personId) return 'friend';
  const cached = nameByPersonId.get(personId);
  if (cached) return cached;

  // mentions sometimes carry the name we need
  const fromMention = (mentions || []).find((m) => String(m?.id) === personId);
  if (fromMention?.name) {
    cacheName(personId, fromMention.name);
    return fromMention.name;
  }

  // direct person lookup
  const fromPerson = await fetchPersonName(personId);
  if (fromPerson) {
    cacheName(personId, fromPerson);
    return fromPerson;
  }

  // member list for the chat (if provided)
  if (chatId) {
    const members = await ensureChatMembers(chatId);
    const fromMembers = members.get(personId);
    if (fromMembers) {
      cacheName(personId, fromMembers);
      return fromMembers;
    }
  }

  return 'friend';
}
