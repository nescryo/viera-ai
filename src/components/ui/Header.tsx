import React from 'react';
import type { UserProfile } from '../../types';
import { MessagesSquare, Settings, User } from 'lucide-react';
import { ExpressionMenu } from './ExpressionMenu';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  userProfile: UserProfile | null;
  currentEmotion: string;
  onSelectEmotion: (emotion: string) => void;
  onOpenHistory: () => void;
  onOpenLorebook: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenProfile,
  userProfile,
  currentEmotion,
  onSelectEmotion,
  onOpenHistory,
  onOpenLorebook
}) => {
  return (
    <header className="header-container floating-header">
      {/* Left: App Brand (Pom-Pom Logo + VIERA) */}
      <div className="header-left">
        <div className="brand-badge">
          <img src="/pom-pom-circle.png" alt="Viera Logo" className="brand-logo-img" />
          <span className="brand-title">VIERA</span>
        </div>
      </div>

      {/* Right: Settings & Profile (⚙ ◉) */}
      <div className="header-right">
        <ExpressionMenu
          currentEmotion={currentEmotion}
          onSelectEmotion={onSelectEmotion}
          onOpenLorebook={onOpenLorebook}
        />

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenHistory}
          title="Conversation History"
          aria-label="Open Conversation History"
        >
          <MessagesSquare size={20} strokeWidth={2} />
        </button>

        {/* Settings Icon */}
        <button 
          className="icon-btn settings-btn" 
          onClick={onOpenSettings} 
          title="Settings & API"
          aria-label="Open Settings and API Configuration"
        >
          <Settings size={20} strokeWidth={2} />
        </button>

        {/* User Profile Avatar Icon */}
        <button 
          className="icon-btn profile-avatar-btn" 
          onClick={onOpenProfile} 
          title="Profile & Account"
          aria-label="Open Profile and Account"
        >
          {userProfile?.picture ? (
            <img src={userProfile.picture} alt={userProfile.nickname || 'Profile'} className="header-user-avatar" />
          ) : (
            <User size={24} strokeWidth={2} />
          )}
        </button>
      </div>
    </header>
  );
};
