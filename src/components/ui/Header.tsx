import React from 'react';
import type { UserProfile } from '../../types';
import { Settings, User } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  userProfile: UserProfile | null;
  // Optional legacy props so existing callers stay valid
  currentPersona?: any;
  onOpenHistory?: () => void;
  onOpenAlternativeMemory?: () => void;
  apiConfig?: any;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenProfile,
  userProfile
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
        {/* Settings Icon */}
        <button 
          className="icon-btn settings-btn" 
          onClick={onOpenSettings} 
          title="Settings & API"
          aria-label="Open Settings and API Configuration"
        >
          <Settings size={18} />
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
            <User size={18} />
          )}
        </button>
      </div>
    </header>
  );
};
