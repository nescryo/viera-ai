import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Persona } from '../../types';
import { 
  Send, Volume2, VolumeX, Copy, Check, RotateCcw,
  Mic, MicOff, Sparkles, Smile
} from 'lucide-react';

interface ChatOverlayProps {
  messages: ChatMessage[];
  currentPersona: Persona;
  onSendMessage: (text: string) => void;
  onRegenerateResponse: () => void;
  onSpeakMessage: (msg: ChatMessage) => void;
  onStopSpeaking: () => void;
  isSpeaking: boolean;
  activeSpeakingId: string | null;
  isLoading: boolean;
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
  const cleanText = safeText.replace(/\[(.*?)\]/g, '<span class="emotion-tag">$1</span>');
  const formatted = cleanText.replace(
    /\*(.*?)\*/g, 
    '<em class="cai-action-text">*$1*</em>'
  );

  return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
};

const ChatMessageItem: React.FC<{
  msg: ChatMessage;
  currentPersona: Persona;
  isSpeaking: boolean;
  activeSpeakingId: string | null;
  copiedId: string | null;
  onSpeakMessage: (msg: ChatMessage) => void;
  onStopSpeaking: () => void;
  onCopy: (id: string, text: string) => void;
  onRegenerateResponse: () => void;
}> = React.memo(({
  msg,
  currentPersona,
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
      <div className="cai-avatar-column">
        {isAI ? (
          <img src={currentPersona.avatarUrl} alt={currentPersona.name} className="cai-msg-avatar" />
        ) : (
          <div className="cai-user-avatar">YOU</div>
        )}
      </div>

      <div className="cai-content-column">
        <div className="cai-msg-header">
          <span className="cai-msg-sender">{isAI ? currentPersona.name : 'You'}</span>
          <span className="cai-msg-time">{msg.timestamp}</span>
          {isAI && <span className="cai-bot-badge">BOT</span>}
        </div>

        <div className="cai-msg-bubble">
          {renderFormattedText(msg.text)}
        </div>

        {isAI && (
          <div className="cai-msg-actions">
            <button 
              className={`cai-action-btn ${isCurrentlySpeaking ? 'speaking-active' : ''}`}
              onClick={() => isCurrentlySpeaking ? onStopSpeaking() : onSpeakMessage(msg)}
              title={isCurrentlySpeaking ? "Stop Speaking" : "Listen to Voice"}
            >
              {isCurrentlySpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            <button 
              className="cai-action-btn" 
              onClick={() => onCopy(msg.id, msg.text)}
              title="Copy text"
            >
              {copiedId === msg.id ? <Check size={15} color="#23a55a" /> : <Copy size={15} />}
            </button>

            <button 
              className="cai-action-btn"
              onClick={onRegenerateResponse}
              title="Regenerate response"
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
  isLoading
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const latestMessageText = messages[messages.length - 1]?.text || '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, latestMessageText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
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
      alert("Browser Anda belum mendukung Speech Recognition. Gunakan Google Chrome atau Edge.");
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
      recognition.lang = 'id-ID';

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
    <div className="chat-overlay-container glass-panel fade-in">
      <div className="chat-header-banner">
        <img src={currentPersona.avatarUrl} alt={currentPersona.name} className="banner-avatar" />
        <div className="banner-details">
          <h2 className="banner-name">{currentPersona.name}</h2>
          <p className="banner-tagline">{currentPersona.tagline}</p>
        </div>
      </div>

      <div className="chat-messages-feed">
        <div className="cai-welcome-card">
          <img src={currentPersona.avatarUrl} alt={currentPersona.name} className="cai-large-avatar" />
          <h3 className="cai-welcome-title">{currentPersona.name}</h3>
          <p className="cai-welcome-tagline">{currentPersona.tagline}</p>
          <div className="cai-greeting-bubble">
            {renderFormattedText(currentPersona.greeting)}
          </div>
        </div>

        {messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            currentPersona={currentPersona}
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
          <div className="cai-message-card cai-msg-ai typing-indicator-card">
            <div className="cai-avatar-column">
              <img src={currentPersona.avatarUrl} alt={currentPersona.name} className="cai-msg-avatar spinning-avatar" />
            </div>
            <div className="cai-content-column">
              <div className="cai-msg-header">
                <span className="cai-msg-sender">{currentPersona.name}</span>
                <span className="cai-typing-status">typing...</span>
              </div>
              <div className="cai-dots-loader">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="cai-quick-prompts">
        <button 
          className="prompt-chip"
          onClick={() => setInputText('*waves enthusiastically* What are you working on right now?')}
        >
          <Sparkles size={13} /> *waves enthusiastically* What are you doing?
        </button>
        <button 
          className="prompt-chip"
          onClick={() => setInputText('Can you tell me a secret story about yourself?')}
        >
          <Smile size={13} /> Tell me a secret story!
        </button>
      </div>

      <form onSubmit={handleSubmit} className="cai-input-form">
        <button 
          type="button" 
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          title={isRecording ? "Listening... Click to stop" : "Voice Speech Input"}
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
        />

        <button 
          type="submit" 
          disabled={!inputText.trim() || isLoading}
          className="send-btn"
          title="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
});
