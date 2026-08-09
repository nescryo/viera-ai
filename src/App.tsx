import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, Persona, ApiConfig, UserProfile, ChatSession } from './types';
import { FIREFLY_PERSONA } from './data/personas';
import { sendStreamingChatMessage, parseResponseText, parseDualOutputResponse } from './services/aiService';
import { ttsService } from './services/ttsService';
import { getCurrentUser, saveCurrentUser, logoutUser } from './services/authService';
import * as historyService from './services/historyService';

import { Header } from './components/ui/Header';
import { ChatOverlay } from './components/ui/ChatOverlay';
import { SettingsModal } from './components/ui/SettingsModal';
import { ModelUploaderModal } from './components/ui/ModelUploaderModal';
import { LoginModal } from './components/ui/LoginModal';
import { SetupOnboardingModal } from './components/ui/SetupOnboardingModal';
import { ConversationHistoryModal } from './components/ui/ConversationHistoryModal';
import { UserProfileModal } from './components/ui/UserProfileModal';
import { Scene } from './components/3d/Scene';

import './App.css';

export function App() {
  // Single dedicated 3D Roleplay Character: Firefly
  const [currentPersona] = useState<Persona>(FIREFLY_PERSONA);
  
  // User Authentication & Profile State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getCurrentUser());
  const [pendingGooglePayload, setPendingGooglePayload] = useState<{ sub: string; email: string; name: string; picture: string } | null>(null);

  // Multi-Session Chat History States
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Modals state
  const [showSettings, setShowSettings] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeakingId, setActiveSpeakingId] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<string>('relaxed');

  // API Configuration (Auto-detects keys from .env or localStorage)
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem('viera_api_config');
    const envDeepseekKey = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
    const envOpenRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
    const envFishAudioKey = import.meta.env.VITE_FISH_AUDIO_API_KEY || '';

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          provider: parsed.provider || 'deepseek',
          deepseekModel: parsed.deepseekModel || 'deepseek-chat',
          deepseekApiKey: parsed.deepseekApiKey || envDeepseekKey,
          openRouterApiKey: parsed.openRouterApiKey || envOpenRouterKey,
          fishAudioApiKey: parsed.fishAudioApiKey || envFishAudioKey
        };
      } catch (e) {
        console.warn("Failed to parse saved apiConfig:", e);
      }
    }
    return {
      provider: 'deepseek',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      deepseekApiKey: envDeepseekKey,
      deepseekModel: 'deepseek-chat',
      geminiApiKey: '',
      openRouterApiKey: envOpenRouterKey,
      openRouterModel: '',
      ttsProvider: 'voicevox',
      voicevoxSpeakerId: 0,
      fishAudioApiKey: envFishAudioKey,
      fishAudioReferenceId: ''
    };
  });

  // Load Sessions when userProfile changes
  useEffect(() => {
    if (userProfile && userProfile.isSetupComplete) {
      const userSessions = historyService.getSessions(userProfile.id);
      let currentActiveId = historyService.getActiveSessionId(userProfile.id);

      if (userSessions.length === 0) {
        const newSess = historyService.createSession(userProfile.id, currentPersona.id, apiConfig.provider);
        setSessions([newSess]);
        setActiveSessionId(newSess.id);
        setMessages([]);
      } else {
        setSessions(userSessions);
        if (!currentActiveId || !userSessions.some((s) => s.id === currentActiveId)) {
          currentActiveId = userSessions[0].id;
          historyService.setActiveSessionId(userProfile.id, currentActiveId);
        }
        setActiveSessionId(currentActiveId);
        const activeSess = userSessions.find((s) => s.id === currentActiveId);
        setMessages(activeSess ? activeSess.messages : []);
      }
    } else {
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [userProfile, currentPersona.id, apiConfig.provider]);

  // Sync messages change back to active session storage
  const syncMessagesToSession = (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    if (userProfile && activeSessionId) {
      const updatedSess = historyService.updateSessionMessages(userProfile.id, activeSessionId, newMessages);
      if (updatedSess) {
        setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? updatedSess : s)));
      }
    }
  };

  const handleSaveConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
    localStorage.setItem('viera_api_config', JSON.stringify(newConfig));
  };

  // Google OAuth Handlers
  const handleGoogleLoginSuccess = (payload: { sub: string; email: string; name: string; picture: string }) => {
    const existing = getCurrentUser();
    if (existing && existing.id === payload.sub && existing.isSetupComplete) {
      setUserProfile(existing);
      setPendingGooglePayload(null);
    } else {
      // Trigger Onboarding Setup
      setPendingGooglePayload(payload);
    }
  };

  const handleCompleteSetup = (completedProfile: UserProfile) => {
    saveCurrentUser(completedProfile);
    setUserProfile(completedProfile);
    setPendingGooglePayload(null);
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    saveCurrentUser(updated);
    setUserProfile(updated);
  };

  const handleLogout = () => {
    logoutUser();
    setUserProfile(null);
    setPendingGooglePayload(null);
    setShowProfile(false);
    setShowHistory(false);
  };

  // Multi-session Handlers
  const handleSelectSession = (sessionId: string) => {
    if (!userProfile) return;
    historyService.setActiveSessionId(userProfile.id, sessionId);
    setActiveSessionId(sessionId);

    const target = sessions.find((s) => s.id === sessionId);
    setMessages(target ? target.messages : []);
    setShowHistory(false); // Auto-close history modal on selection!
  };

  const handleCreateNewChat = () => {
    if (!userProfile) return;
    const newSess = historyService.createSession(userProfile.id, currentPersona.id, apiConfig.provider);
    const updatedSessions = historyService.getSessions(userProfile.id);
    setSessions(updatedSessions);
    setActiveSessionId(newSess.id);
    setMessages([]);
    setShowHistory(false); // Auto-close history modal!
  };

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    if (!userProfile) return;
    historyService.updateSessionTitle(userProfile.id, sessionId, newTitle);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s)));
  };

  const handleDeleteSession = (sessionId: string) => {
    if (!userProfile) return;
    const remaining = historyService.deleteSession(userProfile.id, sessionId);
    setSessions(remaining);

    if (remaining.length === 0) {
      const newSess = historyService.createSession(userProfile.id, currentPersona.id, apiConfig.provider);
      setSessions([newSess]);
      setActiveSessionId(newSess.id);
      setMessages([]);
    } else if (activeSessionId === sessionId) {
      const nextActive = remaining[0];
      setActiveSessionId(nextActive.id);
      setMessages(nextActive.messages);
    }
  };

  const handleClearAllSessions = () => {
    if (!userProfile) return;
    historyService.clearAllSessions(userProfile.id);
    const newSess = historyService.createSession(userProfile.id, currentPersona.id, apiConfig.provider);
    setSessions([newSess]);
    setActiveSessionId(newSess.id);
    setMessages([]);
  };

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      characterId: currentPersona.id,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    syncMessagesToSession(updatedMessages);
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const placeholderAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: 'ai',
      characterId: currentPersona.id,
      text: '',
      emotions: [],
      actions: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const messagesWithPlaceholder = [...updatedMessages, placeholderAiMsg];
    syncMessagesToSession(messagesWithPlaceholder);

    let updateFrameId: number | null = null;
    let latestText = '';

    sendStreamingChatMessage(
      updatedMessages,
      currentPersona,
      apiConfig,
      (_token, fullTextSoFar) => {
        latestText = fullTextSoFar;
        const { emotions } = parseResponseText(fullTextSoFar);
        
        if (emotions.length > 0) {
          const activeEmotion = emotions[emotions.length - 1];
          setCurrentEmotion(activeEmotion);
        }

        if (!updateFrameId) {
          updateFrameId = requestAnimationFrame(() => {
            updateFrameId = null;
            const { emotions: currEmotions, actions: currActions, enText, jaText } = parseDualOutputResponse(latestText);
            const emotionHeader = currEmotions.length > 0 ? `[${currEmotions[0]}] ` : '';
            const actionHeader = currActions.length > 0 ? `*${currActions[0]}* ` : '';
            const displayText = `${emotionHeader}${actionHeader}${enText || latestText}`;
            setMessages((prev) => {
              const next = prev.map((msg) =>
                msg.id === aiMsgId
                  ? { ...msg, text: displayText, originalText: jaText || latestText, emotions: currEmotions, actions: currActions }
                  : msg
              );
              if (userProfile && activeSessionId) {
                historyService.updateSessionMessages(userProfile.id, activeSessionId, next);
              }
              return next;
            });
          });
        }
      },
      (fullText) => {
        if (updateFrameId) {
          cancelAnimationFrame(updateFrameId);
          updateFrameId = null;
        }
        const { emotions, actions, jaText, enText } = parseDualOutputResponse(fullText);
        const activeEmotion = emotions.length > 0 ? emotions[emotions.length - 1] : 'happy';
        setCurrentEmotion(activeEmotion);

        const emotionHeader = emotions.length > 0 ? `[${emotions[0]}] ` : '';
        const actionHeader = actions.length > 0 ? `*${actions[0]}* ` : '';
        const uiDisplayText = `${emotionHeader}${actionHeader}${enText}`;

        const finalMsg: ChatMessage = {
          id: aiMsgId,
          sender: 'ai',
          characterId: currentPersona.id,
          text: uiDisplayText,
          originalText: jaText,
          rawText: fullText,
          emotions,
          actions,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages((prev) => {
          const next = prev.map((msg) => (msg.id === aiMsgId ? finalMsg : msg));
          if (userProfile && activeSessionId) {
            historyService.updateSessionMessages(userProfile.id, activeSessionId, next);
          }
          return next;
        });

        speakMessage(finalMsg);
      },
      (err) => {
        if (updateFrameId) {
          cancelAnimationFrame(updateFrameId);
          updateFrameId = null;
        }
        console.error("Streaming error:", err);
        setIsLoading(false);
      },
      userProfile
    );
  };

  const speakMessage = (msg: ChatMessage) => {
    setActiveSpeakingId(msg.id);
    setIsSpeaking(true);

    ttsService.speak(
      msg.originalText || msg.text,
      currentPersona,
      () => {
        setIsSpeaking(true);
      },
      () => {
        setIsSpeaking(false);
        setActiveSpeakingId(null);
      },
      undefined,
      apiConfig
    );
  };

  const stopSpeaking = () => {
    ttsService.stop();
    setIsSpeaking(false);
    setActiveSpeakingId(null);
  };

  const handleRegenerateResponse = () => {
    if (messages.length === 0 || isLoading) return;
    
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const trimmedHistory = messages.slice(0, lastUserIndex + 1);
    syncMessagesToSession(trimmedHistory);
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const placeholderAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: 'ai',
      characterId: currentPersona.id,
      text: '',
      emotions: [],
      actions: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const messagesWithPlaceholder = [...trimmedHistory, placeholderAiMsg];
    syncMessagesToSession(messagesWithPlaceholder);

    let updateFrameId: number | null = null;
    let latestText = '';

    sendStreamingChatMessage(
      trimmedHistory,
      currentPersona,
      apiConfig,
      (_token, fullTextSoFar) => {
        latestText = fullTextSoFar;
        const { emotions } = parseResponseText(fullTextSoFar);
        
        if (emotions.length > 0) {
          const activeEmotion = emotions[emotions.length - 1];
          setCurrentEmotion(activeEmotion);
        }

        if (!updateFrameId) {
          updateFrameId = requestAnimationFrame(() => {
            updateFrameId = null;
            const { emotions: currEmotions, actions: currActions, enText, jaText } = parseDualOutputResponse(latestText);
            const emotionHeader = currEmotions.length > 0 ? `[${currEmotions[0]}] ` : '';
            const actionHeader = currActions.length > 0 ? `*${currActions[0]}* ` : '';
            const displayText = `${emotionHeader}${actionHeader}${enText || latestText}`;
            setMessages((prev) => {
              const next = prev.map((msg) =>
                msg.id === aiMsgId
                  ? { ...msg, text: displayText, originalText: jaText || latestText, emotions: currEmotions, actions: currActions }
                  : msg
              );
              if (userProfile && activeSessionId) {
                historyService.updateSessionMessages(userProfile.id, activeSessionId, next);
              }
              return next;
            });
          });
        }
      },
      (fullText) => {
        if (updateFrameId) {
          cancelAnimationFrame(updateFrameId);
          updateFrameId = null;
        }
        setIsLoading(false);
        const { emotions, actions, jaText, enText } = parseDualOutputResponse(fullText);
        const activeEmotion = emotions.length > 0 ? emotions[emotions.length - 1] : 'happy';
        setCurrentEmotion(activeEmotion);

        const emotionHeader = emotions.length > 0 ? `[${emotions[0]}] ` : '';
        const actionHeader = actions.length > 0 ? `*${actions[0]}* ` : '';
        const uiDisplayText = `${emotionHeader}${actionHeader}${enText}`;

        const finalMsg: ChatMessage = {
          id: aiMsgId,
          sender: 'ai',
          characterId: currentPersona.id,
          text: uiDisplayText,
          originalText: jaText,
          rawText: fullText,
          emotions,
          actions,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages((prev) => {
          const next = prev.map((msg) => (msg.id === aiMsgId ? finalMsg : msg));
          if (userProfile && activeSessionId) {
            historyService.updateSessionMessages(userProfile.id, activeSessionId, next);
          }
          return next;
        });

        speakMessage(finalMsg);
      },
      (err) => {
        if (updateFrameId) {
          cancelAnimationFrame(updateFrameId);
          updateFrameId = null;
        }
        console.error("Streaming error:", err);
        setIsLoading(false);
      },
      userProfile
    );
  };

  const handleSelectEmotion = useCallback((emotion: string) => {
    setCurrentEmotion(emotion);
  }, []);

  return (
    <div className="app-container">
      <Scene 
        currentPersona={currentPersona}
        isSpeaking={isSpeaking}
        currentEmotion={currentEmotion}
        onSelectEmotion={handleSelectEmotion}
        apiConfig={apiConfig}
      />

      <Header
        currentPersona={currentPersona}
        onOpenSettings={() => setShowSettings(true)}
        onOpenModelUploader={() => setShowUploader(true)}
        onOpenHistory={() => setShowHistory(true)}
        onOpenProfile={() => setShowProfile(true)}
        apiConfig={apiConfig}
        userProfile={userProfile}
      />

      <ChatOverlay
        messages={messages}
        currentPersona={currentPersona}
        onSendMessage={handleSendMessage}
        onRegenerateResponse={handleRegenerateResponse}
        onSpeakMessage={speakMessage}
        onStopSpeaking={stopSpeaking}
        isSpeaking={isSpeaking}
        activeSpeakingId={activeSpeakingId}
        isLoading={isLoading}
      />

      {/* 1. Google OAuth Auth Gate Modal */}
      {!userProfile && !pendingGooglePayload && (
        <LoginModal onGoogleLoginSuccess={handleGoogleLoginSuccess} />
      )}

      {/* 2. Discord-style "Complete Your Setup" Onboarding Modal */}
      {pendingGooglePayload && (
        <SetupOnboardingModal
          initialProfile={pendingGooglePayload}
          onCompleteSetup={handleCompleteSetup}
        />
      )}

      {/* 3. Settings Modal */}
      {showSettings && (
        <SettingsModal
          apiConfig={apiConfig}
          onSaveConfig={handleSaveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 4. Model Uploader Modal */}
      {showUploader && (
        <ModelUploaderModal
          onLoadModelFile={(file) => {
            console.log("Loaded custom 3D model file:", file.name);
          }}
          onClose={() => setShowUploader(false)}
        />
      )}

      {/* 5. Project Airi Concept Conversation History Modal */}
      {showHistory && (
        <ConversationHistoryModal
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onCreateNewChat={handleCreateNewChat}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          onClearAllSessions={handleClearAllSessions}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* 6. Character.AI Concept User Profile Modal */}
      {showProfile && userProfile && (
        <UserProfileModal
          userProfile={userProfile}
          onUpdateProfile={handleUpdateProfile}
          onLogout={handleLogout}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}

export default App;
