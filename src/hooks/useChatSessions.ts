import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, ChatSession } from '../types';
import type { ChessGameRecord } from '../services/chess/chessSession';
import { DEFAULT_EMOTION_ID } from '../data/emotionRegistry';
import * as historyService from '../services/historyService';
import * as chatSync from '../services/chatSyncService';
import { GUEST_USER_ID } from '../services/authService';

const PUSH_DEBOUNCE_MS = 2000;

/**
 * Chat sessions for the signed-in user, stored in localStorage.
 * With `cloudSyncEnabled`, sessions are merged with Supabase on sign-in and changes are pushed after a short delay.
 */
export function useChatSessions(
  userId: string | undefined,
  personaId: string,
  provider?: string,
  cloudSyncEnabled: boolean = false,
  onSyncError?: (error: unknown) => void
) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<string>(DEFAULT_EMOTION_ID);

  // Always-current messages, so callers outside the render cycle can append safely
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initialize and synchronize sessions when user profile or active persona changes
  useEffect(() => {
    if (userId) {
      const userSessions = historyService.getSessions(userId);
      let currentActiveId = historyService.getActiveSessionId(userId);

      if (userSessions.length === 0) {
        const newSess = historyService.createSession(userId, personaId, provider);
        setSessions([newSess]);
        setActiveSessionId(newSess.id);
        setMessages([]);
      } else {
        setSessions(userSessions);
        if (!currentActiveId || !userSessions.some((s) => s.id === currentActiveId)) {
          currentActiveId = userSessions[0].id;
          historyService.setActiveSessionId(userId, currentActiveId);
        }
        setActiveSessionId(currentActiveId);
        const activeSess = userSessions.find((s) => s.id === currentActiveId);
        setMessages(activeSess ? activeSess.messages : []);
        if (activeSess?.currentEmotion) {
          setCurrentEmotion(activeSess.currentEmotion);
        }
      }
    } else {
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [userId, personaId, provider]);

  // Synchronize messages change back to active session storage
  const syncMessagesToSession = useCallback((newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    if (userId && activeSessionId) {
      const updatedSess = historyService.updateSessionMessages(userId, activeSessionId, newMessages);
      if (updatedSess) {
        setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updatedSess : s)));
      }
    }
  }, [userId, activeSessionId]);

  const appendMessages = useCallback((added: ChatMessage[]) => {
    if (added.length === 0) return;
    const next = [...messagesRef.current, ...added];
    messagesRef.current = next;
    syncMessagesToSession(next);
  }, [syncMessagesToSession]);

  const saveChessGame = useCallback((game: ChessGameRecord) => {
    if (!userId || !activeSessionId) return;
    const updatedSess = historyService.updateSessionChessGame(userId, activeSessionId, game);
    if (updatedSess) {
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updatedSess : s)));
    }
  }, [userId, activeSessionId]);

  const selectSession = useCallback((sessionId: string) => {
    if (!userId) return;
    historyService.setActiveSessionId(userId, sessionId);
    setActiveSessionId(sessionId);

    const target = sessions.find((s) => s.id === sessionId);
    setMessages(target ? target.messages : []);
    if (target?.currentEmotion) {
      setCurrentEmotion(target.currentEmotion);
    }
  }, [userId, sessions]);

  const createNewChat = useCallback(() => {
    if (!userId) return;
    const newSess = historyService.createSession(userId, personaId, provider);
    const updatedSessions = historyService.getSessions(userId);
    setSessions(updatedSessions);
    setActiveSessionId(newSess.id);
    setMessages([]);
    setCurrentEmotion(DEFAULT_EMOTION_ID);
  }, [userId, personaId, provider]);

  const renameSession = useCallback((sessionId: string, newTitle: string) => {
    if (!userId) return;
    historyService.updateSessionTitle(userId, sessionId, newTitle);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s)));
  }, [userId]);

  const deleteSession = useCallback((sessionId: string) => {
    if (!userId) return;
    if (userId !== GUEST_USER_ID) chatSync.addTombstones(userId, [sessionId]);
    const remaining = historyService.deleteSession(userId, sessionId);
    setSessions(remaining);

    if (remaining.length === 0) {
      const newSess = historyService.createSession(userId, personaId, provider);
      setSessions([newSess]);
      setActiveSessionId(newSess.id);
      setMessages([]);
      setCurrentEmotion(DEFAULT_EMOTION_ID);
    } else if (activeSessionId === sessionId) {
      const nextActive = remaining[0];
      setActiveSessionId(nextActive.id);
      setMessages(nextActive.messages);
      setCurrentEmotion(nextActive.currentEmotion || DEFAULT_EMOTION_ID);
    }
  }, [userId, personaId, provider, activeSessionId]);

  const clearAllSessions = useCallback(() => {
    if (!userId) return;
    if (userId !== GUEST_USER_ID) {
      chatSync.addTombstones(userId, historyService.getSessions(userId).map((s) => s.id));
    }
    historyService.clearAllSessions(userId);
    const newSess = historyService.createSession(userId, personaId, provider);
    setSessions([newSess]);
    setActiveSessionId(newSess.id);
    setMessages([]);
    setCurrentEmotion(DEFAULT_EMOTION_ID);
  }, [userId, personaId, provider]);

  const updateSessionEmotion = useCallback((emotion: string) => {
    setCurrentEmotion(emotion);
    if (userId && activeSessionId) {
      const updatedSess = historyService.updateSessionEmotion(userId, activeSessionId, emotion);
      if (updatedSess) {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? updatedSess : s))
        );
      }
    }
  }, [userId, activeSessionId]);

  const updateSessionSummary = useCallback((summary: string, lastSummarizedIndex: number) => {
    if (!userId || !activeSessionId) return;
    const updatedSess = historyService.updateSessionSummary(
      userId,
      activeSessionId,
      summary,
      lastSummarizedIndex
    );
    if (updatedSess) {
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updatedSess : s)));
    }
  }, [userId, activeSessionId]);

  // --- Cloud sync (opt-in, signed-in users only) ---
  const syncActive = Boolean(userId) && userId !== GUEST_USER_ID && cloudSyncEnabled;
  const onSyncErrorRef = useRef(onSyncError);
  useEffect(() => {
    onSyncErrorRef.current = onSyncError;
  }, [onSyncError]);
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);
  const sessionDefaultsRef = useRef({ personaId, provider });
  useEffect(() => {
    sessionDefaultsRef.current = { personaId, provider };
  }, [personaId, provider]);
  // Last `updatedAt` known to be on the server, per session ID
  const pushedAtRef = useRef(new Map<string, number>());
  // Pushing waits for the first pull, so stale local data never overwrites newer remote data
  const [pulledUserId, setPulledUserId] = useState<string | null>(null);

  useEffect(() => {
    pushedAtRef.current = new Map();
    if (!syncActive || !userId) return;
    let cancelled = false;

    chatSync.fetchRemoteSessions(userId).then((remote) => {
      if (cancelled) return;
      const local = historyService.getSessions(userId);
      const merged = chatSync.mergeSessions(local, remote, chatSync.getTombstones(userId));
      for (const row of remote) {
        if (row.deleted_at === null) pushedAtRef.current.set(row.id, Number(row.updated_at));
      }
      historyService.saveSessions(userId, merged);

      let active = merged.find((s) => s.id === activeSessionIdRef.current) ?? merged[0];
      if (!active) {
        const { personaId: defaultPersona, provider: defaultProvider } = sessionDefaultsRef.current;
        active = historyService.createSession(userId, defaultPersona, defaultProvider);
        merged.push(active);
      }
      historyService.setActiveSessionId(userId, active.id);
      setSessions(merged);
      if (active.id !== activeSessionIdRef.current || !local.includes(active)) {
        setActiveSessionId(active.id);
        messagesRef.current = active.messages;
        setMessages(active.messages);
        setCurrentEmotion(active.currentEmotion || DEFAULT_EMOTION_ID);
      }
      setPulledUserId(userId);
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.warn('[Viera Sync] Could not load chats from the cloud.', error);
      onSyncErrorRef.current?.(error);
    });

    return () => {
      cancelled = true;
      setPulledUserId(null);
    };
  }, [syncActive, userId]);

  // Every local change goes through setSessions, so `sessions` changing is the push trigger
  useEffect(() => {
    if (!syncActive || !userId || pulledUserId !== userId) return;
    const timer = window.setTimeout(() => {
      const changed = chatSync.selectSessionsToPush(historyService.getSessions(userId), pushedAtRef.current);
      const tombstones = chatSync.getTombstones(userId);
      if (changed.length === 0 && Object.keys(tombstones).length === 0) return;
      chatSync.pushChanges(userId, changed, tombstones).then(() => {
        for (const s of changed) pushedAtRef.current.set(s.id, s.updatedAt);
        chatSync.clearTombstones(userId, Object.keys(tombstones));
      }).catch((error: unknown) => {
        console.warn('[Viera Sync] Could not save chats to the cloud.', error);
        onSyncErrorRef.current?.(error);
      });
    }, PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [syncActive, userId, pulledUserId, sessions]);

  return {
    sessions,
    activeSessionId,
    messages,
    setMessages,
    currentEmotion,
    setCurrentEmotion,
    syncMessagesToSession,
    appendMessages,
    saveChessGame,
    selectSession,
    createNewChat,
    renameSession,
    deleteSession,
    clearAllSessions,
    updateSessionEmotion,
    updateSessionSummary
  };
}
