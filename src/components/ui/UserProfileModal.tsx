import React, { useEffect, useState } from 'react';
import type { UserProfile } from '../../types';
import { AlertCircle, LogOut, Pencil, User, X } from 'lucide-react';
import { AvatarPicker } from './profile/AvatarPicker';
import { ProfileFields } from './profile/ProfileFields';
import { TextField } from './forms/TextField';
import { BIO_MAX, genderLabel, validateProfileInput, type Gender } from '../../services/profileValidation';
import './forms/forms.css';
import './profile/profile.css';

interface UserProfileModalProps {
  userProfile: UserProfile;
  onUpdateProfile: (updatedProfile: UserProfile) => void;
  onLogout: () => void;
  onClose: () => void;
}

const stripAt = (handle: string) => handle.replace(/^@+/, '');

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  userProfile,
  onUpdateProfile,
  onLogout,
  onClose
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [nickname, setNickname] = useState<string>(userProfile.nickname || '');
  const [username, setUsername] = useState<string>(stripAt(userProfile.username || ''));
  const [picture, setPicture] = useState<string>(userProfile.picture || '');
  const [gender, setGender] = useState<Gender>(userProfile.gender || 'unspecified');
  const [bio, setBio] = useState<string>(userProfile.bio ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Escape closes the modal (a dropdown handles its own Escape first)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Start every edit from the saved profile so a cancelled edit leaves no residue
  const startEditing = () => {
    setNickname(userProfile.nickname || '');
    setUsername(stripAt(userProfile.username || ''));
    setPicture(userProfile.picture || '');
    setGender(userProfile.gender || 'unspecified');
    setBio(userProfile.bio ?? '');
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const result = validateProfileInput({ username, nickname });
    if (!result.ok) {
      setErrorMsg(result.error);
      return;
    }

    onUpdateProfile({
      ...userProfile,
      nickname: result.nickname,
      username: result.username,
      picture: picture.trim() || userProfile.picture,
      gender,
      bio: bio.trim()
    });
    setIsEditing(false);
    setErrorMsg(null);
  };

  const genderText = genderLabel(userProfile.gender);
  const hasBio = Boolean(userProfile.bio && userProfile.bio.trim());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container profile-modal glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <User className="modal-icon" size={20} />
            <h3 id="profile-title">{isEditing ? 'Edit profile' : 'Profile'}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close profile">
            <X size={20} />
          </button>
        </div>

        {!isEditing ? (
          <>
            <div className="profile-view">
              <AvatarPicker picture={userProfile.picture} size="lg" />
              <h4 className="profile-name">{userProfile.nickname || 'User'}</h4>
              <p className="profile-meta">
                <span className="profile-handle">{userProfile.username}</span>
                {genderText && <span> · {genderText}</span>}
              </p>

              {hasBio ? (
                <p className="profile-bio">{userProfile.bio}</p>
              ) : (
                <button type="button" className="btn btn--ghost profile-add-bio" onClick={startEditing}>
                  Add a bio
                </button>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn--ghost is-danger" onClick={onLogout}>
                <LogOut size={16} />
                <span>Log out</span>
              </button>
              <button type="button" className="btn btn--secondary" onClick={startEditing}>
                <Pencil size={16} />
                <span>Edit profile</span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSave} className="profile-form">
            <div className="profile-form-body">
              <AvatarPicker
                picture={picture || userProfile.picture}
                size="md"
                editable
                onChange={setPicture}
                onError={setErrorMsg}
              />

              {errorMsg && (
                <div className="form-alert" role="alert">
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <ProfileFields
                username={username}
                nickname={nickname}
                gender={gender}
                onUsernameChange={setUsername}
                onNicknameChange={setNickname}
                onGenderChange={setGender}
              />

              <TextField
                label="Bio"
                value={bio}
                onChange={setBio}
                maxLength={BIO_MAX}
                placeholder="A few words about you (optional)"
                multiline
                rows={3}
              />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn--secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Save changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
