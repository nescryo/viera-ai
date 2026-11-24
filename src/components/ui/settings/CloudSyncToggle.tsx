import React from 'react';

interface CloudSyncToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

/** Opt-in switch for saving chat history to Supabase. Applies immediately. */
export const CloudSyncToggle: React.FC<CloudSyncToggleProps> = ({ enabled, onChange }) => (
  <section className="settings-section">
    <label className="settings-toggle-row">
      <span className="settings-toggle-text">
        <span className="settings-toggle-title">Sync chats to the cloud</span>
        <span className="field-hint">
          Saves your chat history to this app's Supabase project so it appears on your other devices. API keys are never synced.
        </span>
      </span>
      <input
        type="checkbox"
        className="settings-switch"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  </section>
);
