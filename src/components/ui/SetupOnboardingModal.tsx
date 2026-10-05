import React, { useState } from 'react';
import type { UserProfile } from '../../types';
import { AlertCircle } from 'lucide-react';
import { AvatarPicker } from './profile/AvatarPicker';
import { ProfileFields } from './profile/ProfileFields';
import { validateProfileInput, type Gender } from '../../services/profileValidation';
import './forms/forms.css';
import './profile/profile.css';

interface SetupOnboardingModalProps {
  initialProfile: Partial<UserProfile> & { name?: string };
  onCompleteSetup: (completedProfile: UserProfile) => void;
}

const DEFAULT_AVATAR = 'https://api.dicebear.com/7.x/bottts/svg?seed=viera';

export const SetupOnboardingModal: React.FC<SetupOnboardingModalProps> = ({
  initialProfile,
  onCompleteSetup
}) => {
  const [username, setUsername] = useState<string>((initialProfile.username || '').replace(/^@+/, ''));
  const [nickname, setNickname] = useState<string>(initialProfile.nickname || initialProfile.name || '');
  const [picture, setPicture] = useState<string>(initialProfile.picture || DEFAULT_AVATAR);
  const [gender, setGender] = useState<Gender>(initialProfile.gender || 'unspecified');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const result = validateProfileInput({ username, nickname });
    if (!result.ok) {
      setErrorMsg(result.error);
      return;
    }

    onCompleteSetup({
      id: initialProfile.id || Date.now().toString(),
      email: initialProfile.email || '',
      username: result.username,
      nickname: result.nickname,
      picture,
      gender,
      bio: initialProfile.bio || '',
      isSetupComplete: true,
      createdAt: initialProfile.createdAt || Date.now()
    });
  };

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div
        className="modal-container onboarding-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="onboarding-head">
          <h2 id="onboarding-title" className="onboarding-title">Set up your profile</h2>
          <p className="onboarding-subtitle">Tell Firefly who you are.</p>
        </div>

        <form onSubmit={handleSubmit} className="profile-form">
          <div className="profile-form-body">
            <AvatarPicker picture={picture} size="md" editable onChange={setPicture} onError={setErrorMsg} />

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
          </div>

          <div className="modal-footer">
            <button type="submit" className="btn btn--primary btn--block">
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
