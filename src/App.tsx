import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, Persona, ApiConfig, UserProfile } from './types';
import { DEFAULT_CHARACTER_PACKAGE } from './characters/registry';
import { sendStreamingChatMessage, parseResponseText, generateEpisodicMemory } from './services/aiService';
import { getProviderById, AI_PROVIDERS } from './data/aiProviders';
import { getCurrentUser, saveCurrentUser, logoutUser } from './services/authService';
import { soundService } from './services/soundService';

import { useToasts } from './hooks/useToasts';
import { useSpeechAudio } from './hooks/useSpeechAudio';
import { useChatSessions } from './hooks/useChatSessions';

import { Header } from './components/ui/Header';
import { ChatOverlay } from './components/ui/ChatOverlay';
import { SettingsModal } from './components/ui/SettingsModal';
import { LoginModal } from './components/ui/LoginModal';
import { SetupOnboardingModal } from './components/ui/SetupOnboardingModal';
import { ConversationHistoryModal } from './components/ui/ConversationHistoryModal';
import { UserProfileModal } from './components/ui/UserProfileModal';
import { AlternativeMemoryModal } from './components/ui/AlternativeMemoryModal';
import { ToastContainer } from './components/ui/Toast';
import { Scene } from './components/3d/Scene';

import './App.css';

type ActiveModal = 'settings' | 'history' | 'profile' | 'alternativeMemory' | null;

export function App() {
  // 1. Active 3D Roleplay Character Package with persistent custom lore
  const [currentPersona, setCurrentPersona] = useState<Persona>(() => {
    const savedLore = localStorage.getItem(`viera_custom_lore_${DEFAULT_CHARACTER_PACKAGE.id}`);
    if (savedLore) {
      return { ...DEFAULT_CHARACTER_PACKAGE, customLore: savedLore };
    }
    return DEFAULT_CHARACTER_PACKAGE;
  });

  // 2. User Authentication & Profile State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getCurrentUser());
  const [pendingGooglePayload, setPendingGooglePayload] = useState<{ sub: string; email: string; name: string; picture: string } | null>(null);

  // 3. Consolidated Modal State (Replaces scattered boolean flags)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // 4. API Gateway Configuration (loaded from localStorage, edited via Settings)
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem('viera_api_config');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const providerInfo = getProviderById(parsed.provider || 'openrouter');
        const resolvedApiKey = (parsed.apiKey || parsed.deepseekApiKey || parsed.openRouterApiKey || '').trim();
        const resolvedBaseUrl = (parsed.baseUrl || providerInfo.defaultBaseUrl || '').trim();
        const resolvedModel = (parsed.model || providerInfo.defaultModel || '').trim();
        const resolvedFishRefId = parsed.fishAudioReferenceId === '7f92f8afb8ec43bf81429cc1c9199cb1' ? '' : (parsed.fishAudioReferenceId || '');

        return {
          ...parsed,
          provider: parsed.provider || providerInfo.id,
          baseUrl: resolvedBaseUrl,
          apiKey: resolvedApiKey,
          model: resolvedModel,
          ttsProvider: (parsed.ttsProvider === 'voicevox' || parsed.ttsProvider === 'vits') ? 'fish-audio' : (parsed.ttsProvider || 'fish-audio'),
          fishAudioApiKey: parsed.fishAudioApiKey || '',
          fishAudioReferenceId: resolvedFishRefId
        };
      } catch (e) {
        console.warn("Failed to parse saved apiConfig:", e);
      }
    }

    const initialProvider = AI_PROVIDERS[0];
    return {
      provider: initialProvider.id,
      baseUrl: initialProvider.defaultBaseUrl,
      apiKey: '',
      model: initialProvider.defaultModel,
      availableModels: [],
      ttsProvider: 'fish-audio',
      fishAudioApiKey: '',
      fishAudioReferenceId: '',
      fishAudioModel: 's2.1-pro-free',
      customTtsUrl: '',
      customTtsApiKey: '',
      customTtsModel: '',
      customTtsVoiceId: ''
    };
  });

  // 5. Custom Hooks (Modularized Subsystems)
  const { toasts, addToast, removeToast } = useToasts();
  const { isSpeaking, activeSpeakingId, speakMessage, stopSpeaking } = useSpeechAudio();
  const {
    sessions,
    activeSessionId,
    messages,
    setMessages,
    currentEmotion,
    syncMessagesToSession,
    selectSession,
    createNewChat,
    renameSession,
    deleteSession,
    clearAllSessions,
    updateSessionEmotion,
    updateSessionSummary
  } = useChatSessions(userProfile?.id, currentPersona.id, apiConfig.provider);

  const [isLoading, setIsLoading] = useState(false);

  // 6. Global Keyboard Shortcuts (Esc to close active modal, Ctrl+K / Cmd+K for conversations)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (userProfile && userProfile.isSetupComplete) {
          setActiveModal((prev) => (prev === 'history' ? null : 'history'));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userProfile]);

  // 7. Configuration & Authentication Handlers
  const handleSaveConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
    localStorage.setItem('viera_api_config', JSON.stringify(newConfig));
    addToast('success', 'Configuration Saved', 'AI model and voice synthesis preferences updated successfully.');
  };

  const handleGoogleLoginSuccess = (payload: { sub: string; email: string; name: string; picture: string }) => {
    const existing = getCurrentUser();
    if (existing && existing.id === payload.sub && existing.isSetupComplete) {
      setUserProfile(existing);
      setPendingGooglePayload(null);
    } else {
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
    setActiveModal(null);
  };

  // 8. Streaming Chat Execution
  const executeStreamingChat = (contextMessages: ChatMessage[]) => {
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

    const messagesWithPlaceholder = [...contextMessages, placeholderAiMsg];
    syncMessagesToSession(messagesWithPlaceholder);

    let updateFrameId: number | null = null;
    let latestText = '';

    const currentSession = sessions.find((s) => s.id === activeSessionId);
    const sessionSummary = currentSession?.summary;
    const sessionEmotion = currentSession?.currentEmotion || currentEmotion;

    sendStreamingChatMessage(
      contextMessages,
      currentPersona,
      apiConfig,
      (_token, fullTextSoFar) => {
        latestText = fullTextSoFar;
        const { emotions } = parseResponseText(fullTextSoFar);

        if (emotions.length > 0) {
          const activeEmotion = emotions[emotions.length - 1];
          updateSessionEmotion(activeEmotion);
        }

        if (!updateFrameId) {
          updateFrameId = requestAnimationFrame(() => {
            updateFrameId = null;
            const parsed = parseResponseText(latestText);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMsgId
                  ? {
                      ...msg,
                      text: parsed.cleanText,
                      originalText: parsed.cleanText,
                      jaText: parsed.jaText,
                      emotions: parsed.emotions,
                      actions: parsed.actions
                    }
                  : msg
              )
            );
          });
        }
      },
      (fullText) => {
        if (updateFrameId) {
          cancelAnimationFrame(updateFrameId);
          updateFrameId = null;
        }
        setIsLoading(false);
        const { emotions, actions, cleanText, jaText } = parseResponseText(fullText);
        let finalEmotion = currentEmotion;
        if (emotions.length > 0) {
          finalEmotion = emotions[emotions.length - 1];
          updateSessionEmotion(finalEmotion);
        }

        const finalMsg: ChatMessage = {
          id: aiMsgId,
          sender: 'ai',
          characterId: currentPersona.id,
          text: cleanText || fullText,
          originalText: cleanText || fullText,
          rawText: fullText,
          jaText,
          emotions: emotions.length > 0 ? emotions : [finalEmotion],
          actions,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const next = messagesWithPlaceholder.map((msg) => (msg.id === aiMsgId ? finalMsg : msg));
        syncMessagesToSession(next);

        soundService.playReceive();
        speakMessage(finalMsg, currentPersona, apiConfig);

        // Background Episodic Memory Trigger (consolidates every 50 messages)
        const allMessagesCount = contextMessages.length + 1;
        const lastIdx = currentSession?.lastSummarizedIndex ?? 0;
        if (userProfile && activeSessionId && allMessagesCount - lastIdx >= 50) {
          const messagesToConsolidate = [...contextMessages, finalMsg];
          generateEpisodicMemory(
            messagesToConsolidate,
            currentPersona,
            apiConfig,
            currentSession?.summary,
            userProfile
          ).then((newReflection) => {
            if (newReflection && newReflection.trim()) {
              updateSessionSummary(newReflection.trim(), messagesToConsolidate.length);
            }
          });
        }
      },
      (err) => {
        if (updateFrameId) {
          cancelAnimationFrame(updateFrameId);
          updateFrameId = null;
        }
        console.error("Streaming error:", err);
        setIsLoading(false);
        addToast('error', 'AI Gateway Error', 'Failed to retrieve response from AI engine. Please verify your connection or API key.');
      },
      userProfile,
      sessionSummary,
      sessionEmotion
    );
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      characterId: currentPersona.id,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    executeStreamingChat(updatedMessages);
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
    executeStreamingChat(trimmedHistory);
  };

  const handleUpdateCustomLore = (newLore: string) => {
    const trimmed = newLore.trim();
    if (trimmed) {
      localStorage.setItem(`viera_custom_lore_${currentPersona.id}`, trimmed);
    } else {
      localStorage.removeItem(`viera_custom_lore_${currentPersona.id}`);
    }
    setCurrentPersona((prev) => ({
      ...prev,
      customLore: trimmed || undefined
    }));
    addToast(
      'success',
      'Lorebook Updated',
      trimmed
        ? `${currentPersona.name} has updated their lorebook with your background details.`
        : `Custom lorebook cleared. ${currentPersona.name} is operating strictly on pure canon lore.`
    );
  };

  const handleSelectEmotion = useCallback((emotion: string) => {
    updateSessionEmotion(emotion);
  }, [updateSessionEmotion]);

  return (
    <div className="app-container">
      <Scene 
        currentPersona={currentPersona}
        currentEmotion={currentEmotion}
        onSelectEmotion={handleSelectEmotion}
      />

      <Header
        onOpenSettings={() => setActiveModal('settings')}
        onOpenProfile={() => setActiveModal('profile')}
        userProfile={userProfile}
        currentEmotion={currentEmotion}
        onSelectEmotion={handleSelectEmotion}
        onOpenHistory={() => setActiveModal('history')}
        onOpenLorebook={() => setActiveModal('alternativeMemory')}
      />

      <ChatOverlay
        messages={messages}
        currentPersona={currentPersona}
        userProfile={userProfile}
        onSendMessage={handleSendMessage}
        onRegenerateResponse={handleRegenerateResponse}
        onSpeakMessage={(msg) => speakMessage(msg, currentPersona, apiConfig)}
        onStopSpeaking={stopSpeaking}
        isSpeaking={isSpeaking}
        activeSpeakingId={activeSpeakingId}
        isLoading={isLoading}
        onErrorToast={(title, msg) => addToast('warning', title, msg)}
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
      {activeModal === 'settings' && (
        <SettingsModal
          apiConfig={apiConfig}
          onSaveConfig={handleSaveConfig}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 4. Alternative Memory & Custom Lore Modal */}
      {activeModal === 'alternativeMemory' && (
        <AlternativeMemoryModal
          persona={currentPersona}
          onSaveCustomLore={handleUpdateCustomLore}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 5. Conversation History Modal */}
      {activeModal === 'history' && (
        <ConversationHistoryModal
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => { selectSession(id); setActiveModal(null); }}
          onCreateNewChat={() => { createNewChat(); setActiveModal(null); }}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          onClearAllSessions={clearAllSessions}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 6. User Profile Modal */}
      {activeModal === 'profile' && userProfile && (
        <UserProfileModal
          userProfile={userProfile}
          onUpdateProfile={handleUpdateProfile}
          onLogout={handleLogout}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 7. In-App Glass Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

export default App;
