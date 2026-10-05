import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { parseGoogleJwtPayload } from '../../services/authService';
import './forms/forms.css';
import './LoginModal.css';

// Temporary logo until Viera has its own mark
const LOGO_URL = '/pom-pom-circle.png';

// Shown to users; technical details go to the console instead
const SIGN_IN_UNAVAILABLE = "Sign-in isn't available right now. Please try again later.";

interface LoginModalProps {
  onGoogleLoginSuccess: (jwtPayload: { sub: string; email: string; name: string; picture: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onGoogleLoginSuccess }) => {
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGisLoaded, setIsGisLoaded] = useState<boolean>(false);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    if (!clientId) {
      console.error('[Viera Auth] VITE_GOOGLE_CLIENT_ID is not set in .env.');
      setErrorMsg(SIGN_IN_UNAVAILABLE);
      return;
    }

    const handleCredentialResponse = (response: any) => {
      if (response && response.credential) {
        const payload = parseGoogleJwtPayload(response.credential);
        if (payload) {
          onGoogleLoginSuccess(payload);
        } else {
          console.error('[Viera Auth] Failed to decode the Google credential.');
          setErrorMsg("Couldn't sign you in. Please try again.");
        }
      }
    };

    const initializeGis = () => {
      if ((window as any).google && (window as any).google.accounts) {
        setIsGisLoaded(true);
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse
        });

        if (googleBtnRef.current) {
          (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_dark',
            size: 'large',
            shape: 'pill',
            width: 280,
            text: 'continue_with',
            // Match the app's language instead of the browser's
            locale: 'en'
          });
        }
      }
    };

    // Load Google GIS script dynamically if not present
    if (!(window as any).google) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initializeGis();
      script.onerror = () => {
        console.error('[Viera Auth] Failed to load the Google Sign-In script.');
        setErrorMsg("Couldn't reach Google. Check your connection and reload.");
      };
      document.body.appendChild(script);
    } else {
      initializeGis();
    }
  }, [clientId, onGoogleLoginSuccess]);

  return (
    <div className="modal-backdrop auth-gate-backdrop">
      <div
        className="modal-container login-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <img src={LOGO_URL} alt="" className="login-logo" />
        <h1 id="login-title" className="login-title">Viera</h1>
        <p className="login-tagline">Talk, ask, or just hang out — in 3D.</p>
        <p className="login-features">Chat · Voice · Remembers your conversations</p>

        <div className="login-action">
          {errorMsg && (
            <div className="form-alert" role="alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="login-google-slot">
            <div ref={googleBtnRef} />
            {!isGisLoaded && !errorMsg && <span className="login-loading">Loading…</span>}
          </div>
        </div>

        <p className="login-note">Your chats are saved on this device.</p>
      </div>
    </div>
  );
};
