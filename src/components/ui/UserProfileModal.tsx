import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '../../types';
import { Edit3, LogOut, X, Check, User, Sparkles, Pencil, ChevronDown } from 'lucide-react';
import { normalizeAvatar } from '../../services/imageUtils';

interface UserProfileModalProps {
  userProfile: UserProfile;
  onUpdateProfile: (updatedProfile: UserProfile) => void;
  onLogout: () => void;
  onClose: () => void;
}

const GENDER_OPTIONS = [
  { value: 'unspecified', label: 'Secret / Unspecified' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' }
] as const;

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  userProfile,
  onUpdateProfile,
  onLogout,
  onClose
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [nickname, setNickname] = useState<string>(userProfile.nickname || '');
  const [username, setUsername] = useState<string>(userProfile.username || '@user');
  const [picture, setPicture] = useState<string>(userProfile.picture || '');
  const [gender, setGender] = useState<'male' | 'female' | 'non-binary' | 'unspecified'>(userProfile.gender || 'unspecified');
  const [isGenderOpen, setIsGenderOpen] = useState<boolean>(false);
  const [bio, setBio] = useState<string>(userProfile.bio ?? '');
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
    if (isEditing && fileInputRef.current) {
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

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();

    let cleanHandle = username.trim();
    if (!cleanHandle.startsWith('@')) cleanHandle = `@${cleanHandle}`;

    if (cleanHandle.length < 4) {
      setErrorMsg("Username must be at least 3 characters long.");
      return;
    }

    if (!nickname.trim()) {
      setErrorMsg("Display name cannot be empty.");
      return;
    }

    const updated: UserProfile = {
      ...userProfile,
      nickname: nickname.trim(),
      username: cleanHandle,
      picture: picture.trim() || userProfile.picture,
      gender,
      bio: bio.trim()
    };

    onUpdateProfile(updated);
    setIsEditing(false);
    setErrorMsg(null);
  };

  const currentGenderObj = GENDER_OPTIONS.find((g) => g.value === gender) || GENDER_OPTIONS[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container cai-profile-card glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="profile-close-x" onClick={onClose}>
          <X size={18} />
        </button>

        {/* Top Header Banner */}
        <div className="cai-profile-banner">
          <div
            className={`avatar-ring-glow ${isEditing ? 'editable-avatar-glow' : ''}`}
            onClick={handleAvatarClick}
            title={isEditing ? 'Click to change profile picture' : undefined}
          >
            <img src={isEditing ? (picture || userProfile.picture) : userProfile.picture} alt="User Avatar" className="cai-avatar-lg" />
            {isEditing && (
              <div className="cai-avatar-edit-badge-profile">
                <Pencil size={14} />
              </div>
            )}
          </div>
          {isEditing && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          )}
        </div>

        {/* Content Body */}
        <div className="cai-profile-body">
          {!isEditing ? (
            /* VIEW PROFILE MODE */
            <div className="view-profile-mode">
              <h2 className="cai-nickname">{userProfile.nickname || 'User'}</h2>
              <span className="cai-username">{userProfile.username}</span>

              {/* Badges & Stats Row */}
              <div className="cai-stats-row">
                <span className="stat-chip">
                  <User size={13} />
                  {userProfile.gender === 'female' ? 'Female' : userProfile.gender === 'male' ? 'Male' : userProfile.gender === 'non-binary' ? 'Non-binary' : 'Secret'}
                </span>
              </div>

              {/* Bio Quote */}
              <div className="cai-bio-box">
                <p className={`cai-bio-text ${!userProfile.bio || !userProfile.bio.trim() ? 'empty-bio-muted' : ''}`}>
                  {userProfile.bio && userProfile.bio.trim() !== ''
                    ? `"${userProfile.bio}"`
                    : "This user hasn't created a bio yet."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="cai-action-bar">
                <button className="cai-btn edit-profile-btn" onClick={() => setIsEditing(true)}>
                  <Edit3 size={16} />
                  <span>Edit Profile</span>
                </button>
                <button className="cai-btn logout-btn" onClick={onLogout}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          ) : (
            /* EDIT PROFILE MODE */
            <form onSubmit={handleSaveEdit} className="edit-profile-form">
              <h3 className="edit-form-title">
                <Sparkles size={16} />
                Public Profile
              </h3>

              {errorMsg ? <div className="edit-error-banner">{errorMsg}</div> : null}

              {/* Box 1: Username */}
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

              {/* Box 2: Display Name */}
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

              {/* Box 3: Modern Gender Dropdown */}
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

              {/* Box 4: Bio */}
              <div className="cai-input-group">
                <label className="cai-input-label">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="cai-field-textarea"
                  rows={2}
                  maxLength={500}
                />
                <div className="cai-char-counter">{bio.length}/500</div>
              </div>

              <div className="edit-form-buttons">
                <button type="button" className="cancel-edit-btn" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="save-edit-btn">
                  <Check size={16} />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
