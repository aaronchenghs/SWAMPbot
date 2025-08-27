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
  const existing = chatMembers.get(chatId);
  if (existing) return existing;

  const map = new Map<string, string>();
  try {
    const conversationResponse = await platform.get(`/team-messaging/v1/conversations/${chatId}`);
    const conversationJson: ConversationResponse = await conversationResponse.json();

    const members = conversationJson?.members || [];
    
    for (const m of members) {
      if (m?.id) {
        try {
          const personResponse = await platform.get(`/team-messaging/v1/persons/${m.id}`);
          const personJson: PersonResponse = await personResponse.json();
          const display = personJson.name || '';
          
          if (display) {
            map.set(String(m.id), display);
            cacheName(String(m.id), display);
          }
        } catch (personError) {
          console.error(`Error fetching person details for ID ${m.id}:`, personError);
        }
      }
    }
  } catch (conversationError) {
    console.error(`Error fetching conversation members for chat ID ${chatId}:`, conversationError);
    return new Map<string, string>();
  }

  chatMembers.set(chatId, map);
  console.log(`${map}`);
  return map;
}

// Example of the expected API response types (you will need to define these)
interface ConversationResponse {
  id: string;
  members: { id: string }[];
  name: string;
}

interface PersonResponse {
  id: string;
  name: string;
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
