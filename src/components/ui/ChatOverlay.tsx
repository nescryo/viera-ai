import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Persona, UserProfile } from '../../types';
import { 
  Send, Volume2, VolumeX, Copy, Check, RotateCcw,
  Mic, MicOff, MessageCircle, MessageCircleOff
} from 'lucide-react';
import { soundService } from '../../services/soundService';

interface ChatOverlayProps {
  messages: ChatMessage[];
  currentPersona: Persona;
  userProfile: UserProfile | null;
  onSendMessage: (text: string) => void;
  onRegenerateResponse: () => void;
  onSpeakMessage: (msg: ChatMessage) => void;
  onStopSpeaking: () => void;
  isSpeaking: boolean;
  activeSpeakingId: string | null;
  isLoading: boolean;
  onErrorToast?: (title: string, message: string) => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const renderFormattedText = (text: string) => {
  const safeText = escapeHtml(text);
  const withEmotions = safeText.replace(/\[(.*?)\]/g, '<span class="emotion-tag">$1</span>');
  const withNarratives = withEmotions.replace(
    /&lt;narrative&gt;([\s\S]*?)&lt;\/narrative&gt;/gi,
    '<span class="cai-narrative-text">$1</span>'
  );
  const withBoldItalic = withNarratives.replace(
    /\*\*\*(.*?)\*\*\*/g,
    '<strong><em>$1</em></strong>'
  );
  const withBold = withBoldItalic.replace(
    /\*\*(.*?)\*\*/g,
    '<strong>$1</strong>'
  );
  const formatted = withBold.replace(
    /\*(.*?)\*/g,
    '<em>$1</em>'
  );

  return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
};

const ChatMessageItem: React.FC<{
  msg: ChatMessage;
  isSpeaking: boolean;
  activeSpeakingId: string | null;
  copiedId: string | null;
  onSpeakMessage: (msg: ChatMessage) => void;
  onStopSpeaking: () => void;
  onCopy: (id: string, text: string) => void;
  onRegenerateResponse: () => void;
}> = React.memo(({
  msg,
  isSpeaking,
  activeSpeakingId,
  copiedId,
  onSpeakMessage,
  onStopSpeaking,
  onCopy,
  onRegenerateResponse
}) => {
  const isAI = msg.sender === 'ai';
  const isCurrentlySpeaking = activeSpeakingId === msg.id && isSpeaking;

  return (
    <div className={`cai-message-card ${isAI ? 'cai-msg-ai' : 'cai-msg-user'}`}>
      <div className="cai-msg-bubble">
        {renderFormattedText(msg.text)}
      </div>

      <div className="cai-msg-meta">
        <span className="cai-msg-time">{msg.timestamp}</span>
        {isAI && (
          <div className="cai-msg-actions">
            <button 
              className={`cai-action-btn ${isCurrentlySpeaking ? 'speaking-active' : ''}`}
              onClick={() => isCurrentlySpeaking ? onStopSpeaking() : onSpeakMessage(msg)}
              title={isCurrentlySpeaking ? "Stop Speaking" : "Listen to Voice"}
              aria-label={isCurrentlySpeaking ? "Stop Speaking" : "Listen to Voice"}
            >
              {isCurrentlySpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            <button 
              className="cai-action-btn" 
              onClick={() => onCopy(msg.id, msg.text)}
              title="Copy text"
              aria-label="Copy text to clipboard"
            >
              {copiedId === msg.id ? <Check size={15} /> : <Copy size={15} />}
            </button>

            <button 
              className="cai-action-btn"
              onClick={onRegenerateResponse}
              title="Regenerate response"
              aria-label="Regenerate response"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export const ChatOverlay: React.FC<ChatOverlayProps> = React.memo(({
  messages,
  currentPersona,
  onSendMessage,
  onRegenerateResponse,
  onSpeakMessage,
  onStopSpeaking,
  isSpeaking,
  activeSpeakingId,
  isLoading,
  onErrorToast
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isFeedHidden, setIsFeedHidden] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const latestMessageText = messages[messages.length - 1]?.text || '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, latestMessageText, isFeedHidden]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    soundService.playSend();
    onSendMessage(inputText);
    setInputText('');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (onErrorToast) {
        onErrorToast(
          "Speech Recognition Unavailable",
          "Speech Recognition is not supported by your current browser. Please use Google Chrome or Microsoft Edge."
        );
      }
      return;
    }

    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputText(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setIsRecording(false);
    }
  };

  return (
    <div className="chat-overlay-container fade-in">
      {!isFeedHidden && (
        <div className="chat-messages-feed">
          <div className="cai-message-card cai-msg-ai cai-greeting">
            <div className="cai-msg-bubble">
              {renderFormattedText(currentPersona.greeting)}
            </div>
          </div>

          {messages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              msg={msg}
              isSpeaking={isSpeaking}
              activeSpeakingId={activeSpeakingId}
              copiedId={copiedId}
              onSpeakMessage={onSpeakMessage}
              onStopSpeaking={onStopSpeaking}
              onCopy={handleCopy}
              onRegenerateResponse={onRegenerateResponse}
            />
          ))}

          {isLoading && (
            <div
              className="cai-message-card cai-msg-ai typing-indicator-card"
              role="status"
              aria-label={`${currentPersona.name} is typing`}
            >
              <div className="cai-msg-bubble cai-dots-loader">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="cai-input-form">
        <button
          type="button"
          className="feed-toggle-btn"
          onClick={() => setIsFeedHidden((prev) => !prev)}
          aria-pressed={isFeedHidden}
          title={isFeedHidden ? 'Show messages' : 'Hide messages'}
          aria-label={isFeedHidden ? 'Show messages' : 'Hide messages'}
        >
          {isFeedHidden ? <MessageCircle size={17} /> : <MessageCircleOff size={17} />}
        </button>

        <button 
          type="button" 
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          title={isRecording ? "Listening... Click to stop" : "Voice Speech Input"}
          aria-label={isRecording ? "Stop recording voice" : "Start voice speech input"}
        >
          {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Message ${currentPersona.name}...`}
          className="cai-text-input"
          disabled={isLoading}
          aria-label={`Message input for ${currentPersona.name}`}
        />

        <button 
          type="submit" 
          disabled={!inputText.trim() || isLoading}
          className="send-btn"
          title="Send message"
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
});
