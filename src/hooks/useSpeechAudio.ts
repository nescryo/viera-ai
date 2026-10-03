import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, Persona, ApiConfig } from '../types';
import { ttsService } from '../services/ttsService';

export function useSpeechAudio() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeakingId, setActiveSpeakingId] = useState<string | null>(null);

  const speakMessage = useCallback((msg: ChatMessage, persona: Persona, apiConfig: ApiConfig) => {
    setActiveSpeakingId(msg.id);
    setIsSpeaking(true);

    const isJapaneseMode = apiConfig.ttsMode === 'japanese-dub';
    const textToSpeak = isJapaneseMode && msg.jaText ? msg.jaText : (msg.originalText || msg.text);

    ttsService.speak(
      textToSpeak,
      persona,
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
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsService.stop();
    setIsSpeaking(false);
    setActiveSpeakingId(null);
  }, []);

  useEffect(() => {
    return () => {
      ttsService.stop();
    };
  }, []);

  return {
    isSpeaking,
    activeSpeakingId,
    speakMessage,
    stopSpeaking
  };
}
