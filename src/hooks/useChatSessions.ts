import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage, ChatSession } from '../types';
import { DEFAULT_EMOTION_ID } from '../data/emotionRegistry';
import * as historyService from '../services/historyService';

export function useChatSessions(
  userId: string | undefined,
  personaId: string,
  provider?: string
) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<string>(DEFAULT_EMOTION_ID);

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
      historyService.updateSessionEmotion(userId, activeSessionId, emotion);
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, currentEmotion: emotion } : s))
      );
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

  return {
    sessions,
    activeSessionId,
    messages,
    setMessages,
    currentEmotion,
    setCurrentEmotion,
    syncMessagesToSession,
    selectSession,
    createNewChat,
    renameSession,
    deleteSession,
    clearAllSessions,
    updateSessionEmotion,
    updateSessionSummary
  };
}
