import type { ChatMessage, ChatSession } from '../types';

function getSessionsKey(userId: string): string {
  return `viera_sessions_${userId}`;
}

function getActiveSessionKey(userId: string): string {
  return `viera_active_session_${userId}`;
}

export function generateAutoTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New conversation';
  if (clean.length <= 35) return clean;
  return clean.substring(0, 35) + '...';
}

export function getSessions(userId: string): ChatSession[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getSessionsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to load sessions for user:", userId, e);
    return [];
  }
}

export function saveSessions(userId: string, sessions: ChatSession[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getSessionsKey(userId), JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to save sessions for user:", userId, e);
  }
}

export function getActiveSessionId(userId: string): string | null {
  if (!userId) return null;
  return localStorage.getItem(getActiveSessionKey(userId));
}

export function setActiveSessionId(userId: string, sessionId: string): void {
  if (!userId) return;
  localStorage.setItem(getActiveSessionKey(userId), sessionId);
}

export function createSession(userId: string, characterId: string = 'firefly', provider: string = 'universal'): ChatSession {
  const newSession: ChatSession = {
    id: Date.now().toString(),
    title: 'New conversation',
    characterId,
    provider,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  };

  const existing = getSessions(userId);
  const updated = [newSession, ...existing];
  saveSessions(userId, updated);
  setActiveSessionId(userId, newSession.id);
  return newSession;
}

export function updateSessionMessages(
  userId: string,
  sessionId: string,
  messages: ChatMessage[]
): ChatSession | null {
  if (!userId || !sessionId) return null;

  const sessions = getSessions(userId);
  let updatedSession: ChatSession | null = null;

  const newSessions = sessions.map((s) => {
    if (s.id === sessionId) {
      let title = s.title;
      // Auto-title from first user message if current title is default
      if (s.title === 'New conversation' || !s.title) {
        const firstUserMsg = messages.find((m) => m.sender === 'user');
        if (firstUserMsg && firstUserMsg.text) {
          title = generateAutoTitle(firstUserMsg.text);
        }
      }

      updatedSession = {
        ...s,
        title,
        updatedAt: Date.now(),
        messages
      };
      return updatedSession;
    }
    return s;
  });

  if (updatedSession) {
    saveSessions(userId, newSessions);
  }
  return updatedSession;
}

export function updateSessionTitle(userId: string, sessionId: string, newTitle: string): void {
  if (!userId || !sessionId) return;
  const sessions = getSessions(userId);
  const updated = sessions.map((s) => (s.id === sessionId ? { ...s, title: newTitle, updatedAt: Date.now() } : s));
  saveSessions(userId, updated);
}

export function deleteSession(userId: string, sessionId: string): ChatSession[] {
  if (!userId || !sessionId) return [];
  const sessions = getSessions(userId);
  const remaining = sessions.filter((s) => s.id !== sessionId);
  saveSessions(userId, remaining);

  const activeId = getActiveSessionId(userId);
  if (activeId === sessionId) {
    if (remaining.length > 0) {
      setActiveSessionId(userId, remaining[0].id);
    } else {
      localStorage.removeItem(getActiveSessionKey(userId));
    }
  }
  return remaining;
}

export function clearAllSessions(userId: string): void {
  if (!userId) return;
  localStorage.removeItem(getSessionsKey(userId));
  localStorage.removeItem(getActiveSessionKey(userId));
}
