import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ShieldCheck, AlertCircle } from 'lucide-react';
import { parseGoogleJwtPayload } from '../../services/authService';

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
      setErrorMsg("VITE_GOOGLE_CLIENT_ID is missing in .env! Please set your Google OAuth Client ID.");
      return;
    }

    const handleCredentialResponse = (response: any) => {
      if (response && response.credential) {
        const payload = parseGoogleJwtPayload(response.credential);
        if (payload) {
          onGoogleLoginSuccess(payload);
        } else {
          setErrorMsg("Failed to decode Google login token.");
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
            text: 'continue_with'
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
      script.onerror = () => setErrorMsg("Failed to load Google Sign-In SDK. Please check your network connection.");
      document.body.appendChild(script);
    } else {
      initializeGis();
    }
  }, [clientId, onGoogleLoginSuccess]);

  return (
    <div className="modal-backdrop auth-gate-backdrop">
      <div className="modal-container login-gate-card glass-panel">
        <div className="login-header-glow">
          <div className="login-brand-icon">
            <Sparkles size={36} className="sparkle-glow" />
          </div>
          <h1 className="login-title">Welcome to Viera</h1>
          <p className="login-subtitle">3D Interactive Anime Companion & AI Assistant</p>
        </div>

        <div className="login-body">
          <div className="feature-bullets">
            <div className="bullet-item">
              <ShieldCheck size={18} className="bullet-icon" />
              <span>Real-time 3D Raycasting & Touch Interactions</span>
            </div>
            <div className="bullet-item">
              <ShieldCheck size={18} className="bullet-icon" />
              <span>Fish Audio & Neural Anime Voice Synthesis</span>
            </div>
            <div className="bullet-item">
              <ShieldCheck size={18} className="bullet-icon" />
              <span>Secure Multi-Session Conversation History</span>
            </div>
          </div>

          <div className="google-auth-box">
            <p className="auth-prompt">Sign in with your Google Account to continue</p>

            {errorMsg ? (
              <div className="auth-error-banner">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            ) : null}

            <div className="google-btn-wrapper">
              <div ref={googleBtnRef} className="google-btn-render" />
              {!isGisLoaded && !errorMsg && (
                <div className="gis-loading-spinner">Loading Google OAuth...</div>
              )}
            </div>
          </div>
        </div>

        <div className="login-footer">
          <span className="privacy-note">Protected by Google OAuth 2.0 • Pure Client-Side Encryption</span>
        </div>
      </div>
    </div>
  );
};
