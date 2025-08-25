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
    const name: string =
      json?.name || (json?.firstName && json?.lastName)
        ? `${json.firstName} ${json.lastName}`.trim()
        : '';
    return name || null;
  } catch {
    return null;
  }
}

async function ensureChatMembers(chatId: string): Promise<Map<string, string>> {
  const existing = chatMembers.get(chatId);
  if (existing) return existing;

  const map = new Map<string, string>();
  try {
    const r = await platform.get(`/team-messaging/v1/chats/${chatId}/members`, {
      recordCount: '200',
    } as any);
    const json: MembersResponse = await r.json();
    for (const m of json.records || []) {
      if (m?.id) {
        const display = m.name || '';
        if (display) {
          map.set(String(m.id), display);
          cacheName(String(m.id), display);
        }
      }
    }
  } catch {}

  chatMembers.set(chatId, map);
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

  // cache
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
