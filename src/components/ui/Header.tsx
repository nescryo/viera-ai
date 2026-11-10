import React from 'react';
import type { UserProfile } from '../../types';
import { Gamepad2, MessagesSquare, Settings, User } from 'lucide-react';
import { ExpressionMenu } from './ExpressionMenu';
import { ErrorBoundary } from './ErrorBoundary';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  userProfile: UserProfile | null;
  currentEmotion: string;
  onSelectEmotion: (emotion: string) => void;
  onOpenHistory: () => void;
  onOpenLorebook: () => void;
  onOpenMinigames: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenProfile,
  userProfile,
  currentEmotion,
  onSelectEmotion,
  onOpenHistory,
  onOpenLorebook,
  onOpenMinigames
}) => {
  return (
    <header className="header-container floating-header">
      {/* Left: App Brand (Pom-Pom Logo + VIERA) */}
      <div className="header-left">
        <div className="brand-badge">
          <img src="/viera-avatar.png" alt="Viera Logo" className="brand-logo-img" />
          <span className="brand-title">VIERA</span>
        </div>
      </div>

      {/* Right: Settings & Profile (⚙ ◉) */}
      <div className="header-right">
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenMinigames}
          title="Minigames"
          aria-label="Open Minigames"
        >
          <Gamepad2 size={23} strokeWidth={2} />
        </button>

        <ErrorBoundary>
          <ExpressionMenu
            currentEmotion={currentEmotion}
            onSelectEmotion={onSelectEmotion}
            onOpenLorebook={onOpenLorebook}
          />
        </ErrorBoundary>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenHistory}
          title="Conversation History"
          aria-label="Open Conversation History"
        >
          <MessagesSquare size={23} strokeWidth={2} />
        </button>

        {/* Settings Icon */}
        <button 
          className="icon-btn settings-btn" 
          onClick={onOpenSettings} 
          title="Settings & API"
          aria-label="Open Settings and API Configuration"
        >
          <Settings size={23} strokeWidth={2} />
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
            <User size={27} strokeWidth={2} />
          )}
        </button>
      </div>
    </header>
  );
};
