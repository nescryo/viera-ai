import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '../../types';
import { UserCheck, Sparkles, Pencil, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { normalizeAvatar } from '../../services/imageUtils';

interface SetupOnboardingModalProps {
  initialProfile: Partial<UserProfile> & { name?: string };
  onCompleteSetup: (completedProfile: UserProfile) => void;
}

const GENDER_OPTIONS = [
  { value: 'unspecified', label: 'Secret / Unspecified' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' }
] as const;

export const SetupOnboardingModal: React.FC<SetupOnboardingModalProps> = ({
  initialProfile,
  onCompleteSetup
}) => {
  const [username, setUsername] = useState<string>(initialProfile.username || '');
  const [nickname, setNickname] = useState<string>(initialProfile.nickname || initialProfile.name || '');
  const [picture, setPicture] = useState<string>(initialProfile.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=viera');
  const [gender, setGender] = useState<'male' | 'female' | 'non-binary' | 'unspecified'>(initialProfile.gender || 'unspecified');
  const [isGenderOpen, setIsGenderOpen] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const genderDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (genderDropdownRef.current && !genderDropdownRef.current.contains(e.target as Node)) {
        setIsGenderOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAvatarClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image size exceeds 5MB limit.");
      return;
    }
    normalizeAvatar(file)
      .then((dataUrl) => {
        setPicture(dataUrl);
        setErrorMsg(null);
      })
      .catch(() => {
        setErrorMsg("Could not process that image. Please try a different file.");
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let cleanHandle = username.trim();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }

    if (cleanHandle.length < 4) {
      setErrorMsg("Username must be at least 3 characters long.");
      return;
    }

    if (cleanHandle.length > 21) {
      setErrorMsg("Username max 20 characters.");
      return;
    }

    if (!/^@[a-zA-Z0-9_]+$/.test(cleanHandle)) {
      setErrorMsg("Username can only contain letters, numbers, and underscores.");
      return;
    }

    if (!nickname.trim()) {
      setErrorMsg("Display name cannot be empty.");
      return;
    }

    const finalProfile: UserProfile = {
      id: initialProfile.id || Date.now().toString(),
      email: initialProfile.email || '',
      username: cleanHandle,
      nickname: nickname.trim(),
      picture,
      gender,
      bio: initialProfile.bio || '',
      isSetupComplete: true,
      createdAt: initialProfile.createdAt || Date.now()
    };

    onCompleteSetup(finalProfile);
  };

  const currentGenderObj = GENDER_OPTIONS.find((g) => g.value === gender) || GENDER_OPTIONS[0];

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal-container cai-setup-card glass-panel">
        <div className="setup-header">
          <div className="setup-badge">
            <Sparkles size={16} className="sparkle-glow" />
            <span>Setup Profile</span>
          </div>
          <h2 className="setup-title">Complete Your Setup</h2>
        </div>

        <form onSubmit={handleSubmit} className="setup-form">
          {errorMsg ? (
            <div className="setup-error-banner">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {/* c.ai Avatar Upload Picker */}
          <div className="cai-avatar-upload-box">
            <div className="cai-avatar-clickable" onClick={handleAvatarClick} title="Upload custom profile picture">
              <img src={picture} alt="Avatar" className="cai-setup-avatar-img" />
              <div className="cai-avatar-edit-badge">
                <Pencil size={14} />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* c.ai Style Input Box 1: Username */}
          <div className="cai-input-group">
            <label className="cai-input-label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="cai-field-input"
              maxLength={20}
              required
            />
            <div className="cai-char-counter">{username.replace(/^@/, '').length}/20</div>
          </div>

          {/* c.ai Style Input Box 2: Display Name */}
          <div className="cai-input-group">
            <label className="cai-input-label">Display Name</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="cai-field-input"
              maxLength={20}
              required
            />
            <div className="cai-char-counter">{nickname.length}/20</div>
          </div>

          {/* Modernized Glass Dropdown: Gender */}
          <div className="cai-input-group cai-dropdown-group" ref={genderDropdownRef}>
            <label className="cai-input-label">Gender</label>
            <div
              className="cai-custom-select-trigger"
              onClick={() => setIsGenderOpen((prev) => !prev)}
            >
              <span className="selected-gender-text">{currentGenderObj.label}</span>
              <ChevronDown size={16} className={`dropdown-arrow ${isGenderOpen ? 'open' : ''}`} />
            </div>

            {isGenderOpen && (
              <div className="cai-custom-dropdown-menu glass-panel">
                {GENDER_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    className={`cai-dropdown-option ${gender === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setGender(option.value);
                      setIsGenderOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {gender === option.value && <Check size={14} className="option-check" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Complete Button */}
          <button type="submit" className="submit-btn cai-submit-btn">
            <UserCheck size={18} />
            <span>Complete Setup</span>
          </button>
        </form>
      </div>
    </div>
  );
};
