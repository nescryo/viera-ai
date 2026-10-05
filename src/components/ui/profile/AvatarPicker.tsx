import { useRef } from 'react';
import { Pencil } from 'lucide-react';
import { normalizeAvatar } from '../../../services/imageUtils';
import './profile.css';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

interface AvatarPickerProps {
  picture: string;
  size?: 'md' | 'lg';
  /** When true the avatar is a button that opens the file picker. */
  editable?: boolean;
  onChange?: (dataUrl: string) => void;
  /** Called with a message on failure, or null when a new image was accepted. */
  onError?: (message: string | null) => void;
}

/**
 * Round avatar. With `editable` it lets the user pick an image, which is
 * cropped and resized to a square before being handed to `onChange`.
 */
export const AvatarPicker = ({ picture, size = 'md', editable, onChange, onError }: AvatarPickerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow picking the same file again later
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      onError?.('Image size exceeds 5MB limit.');
      return;
    }
    normalizeAvatar(file)
      .then((dataUrl) => {
        onChange?.(dataUrl);
        onError?.(null);
      })
      .catch(() => onError?.('Could not process that image. Please try a different file.'));
  };

  const image = <img src={picture} alt="" className="avatar-img" />;

  if (!editable) {
    return <div className={`avatar avatar--${size}`}>{image}</div>;
  }

  return (
    <div className={`avatar avatar--${size}`}>
      <button
        type="button"
        className="avatar-button"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Change profile picture"
      >
        {image}
        <span className="avatar-badge" aria-hidden="true">
          <Pencil size={12} />
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="avatar-file-input"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};
