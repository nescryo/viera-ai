import { Select } from '../forms/Select';
import { TextField } from '../forms/TextField';
import { GENDER_OPTIONS, NICKNAME_MAX, USERNAME_MAX, type Gender } from '../../../services/profileValidation';

interface ProfileFieldsProps {
  /** Username without the leading "@" (it is shown as a fixed prefix). */
  username: string;
  nickname: string;
  gender: Gender;
  onUsernameChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onGenderChange: (value: Gender) => void;
}

/** Username, display name and gender, shared by onboarding and the profile editor. */
export const ProfileFields = ({
  username,
  nickname,
  gender,
  onUsernameChange,
  onNicknameChange,
  onGenderChange
}: ProfileFieldsProps) => (
  <>
    <TextField
      label="Username"
      prefix="@"
      value={username}
      onChange={(value) => onUsernameChange(value.replace(/^@+/, ''))}
      maxLength={USERNAME_MAX}
      placeholder="username"
      required
    />
    <TextField
      label="Display name"
      value={nickname}
      onChange={onNicknameChange}
      maxLength={NICKNAME_MAX}
      placeholder="What should they call you?"
      required
    />
    <Select
      label="Gender"
      options={GENDER_OPTIONS}
      value={gender}
      onChange={onGenderChange}
    />
  </>
);
