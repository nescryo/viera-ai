import React, { useEffect, useState } from 'react';
import type { Persona, ApiConfig, UserProfile } from '../../types';
import { Settings, Sparkles, Circle, MessageSquare, User } from 'lucide-react';
import { checkLmStudioConnection } from '../../services/aiService';

interface HeaderProps {
  currentPersona: Persona;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenProfile: () => void;
  apiConfig: ApiConfig;
  userProfile: UserProfile | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentPersona,
  onOpenSettings,
  onOpenHistory,
  onOpenProfile,
  apiConfig,
  userProfile
}) => {
  const [isLmStudioOnline, setIsLmStudioOnline] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const checkConnection = async () => {
      if (apiConfig.provider === 'lmstudio') {
        const online = await checkLmStudioConnection(apiConfig.lmStudioUrl);
        if (isMounted) setIsLmStudioOnline(online);
      } else {
        if (isMounted) setIsLmStudioOnline(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiConfig]);

  return (
    <header className="header-container glass-panel">
      {/* Left: App Brand & Active 3D Character Status */}
      <div className="header-left">
        <div className="brand-badge">
          <Sparkles className="icon-sparkle" size={20} />
          <span className="brand-title">VIERA</span>
          <span className="brand-version">3D</span>
        </div>

        <div className="divider-v" />

        <div className="single-persona-chip">
          <div className="avatar-wrapper">
            <img src={currentPersona.avatarUrl} alt={currentPersona.name} className="chip-avatar" />
            <Circle className="status-online" size={10} />
          </div>
          <div className="chip-info">
            <span className="chip-name">{currentPersona.name}</span>
            <span className="chip-category">Active 3D Avatar</span>
          </div>
        </div>
      </div>

      {/* Right: 3D Model Loader, History, Settings & Profile */}
      <div className="header-right">
        <div className={`provider-pill ${apiConfig.provider === 'deepseek' ? 'online' : isLmStudioOnline ? 'online' : 'offline'}`}>
          <span className={`provider-dot ${apiConfig.provider === 'deepseek' ? 'dot-online' : isLmStudioOnline ? 'dot-online' : 'dot-offline'}`} />
          <span className="provider-name">
            {apiConfig.provider === 'deepseek'
              ? 'DeepSeek AI (Cloud)'
              : apiConfig.provider === 'lmstudio'
              ? isLmStudioOnline
                ? 'LM Studio (Connected :1234)'
                : 'LM Studio (Offline • Mock Mode)'
              : 'Demo RP Engine'}
          </span>
        </div>


        {/* 1. Conversation History Icon (Left of Settings) */}
        <button className="icon-btn history-btn" onClick={onOpenHistory} title="Conversations History">
          <MessageSquare size={18} />
        </button>

        {/* 2. Settings Icon */}
        <button className="icon-btn settings-btn" onClick={onOpenSettings} title="Settings & API">
          <Settings size={18} />
        </button>

        {/* 3. User Profile Avatar Icon (Right of Settings) */}
        <button className="icon-btn profile-avatar-btn" onClick={onOpenProfile} title="Profile & Account">
          {userProfile?.picture ? (
            <img src={userProfile.picture} alt={userProfile.nickname || 'Profile'} className="header-user-avatar" />
          ) : (
            <User size={18} />
          )}
        </button>
      </div>
    </header>
  );
};
