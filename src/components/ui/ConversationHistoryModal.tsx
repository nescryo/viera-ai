import React, { useMemo, useState } from 'react';
import type { ChatSession } from '../../types';
import { Plus, Trash2, Pencil, Check, X, MessageSquare, AlertTriangle } from 'lucide-react';
import { groupByDay } from '../../services/dateGrouping';
import './ConversationHistoryModal.css';

interface ConversationHistoryModalProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateNewChat: () => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearAllSessions: () => void;
  onClose: () => void;
}

/** Short relative time: "now", "5m", "3h", "2d", "4mo". */
const formatShortTime = (timestamp: number): string => {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
};

export const ConversationHistoryModal: React.FC<ConversationHistoryModalProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewChat,
  onRenameSession,
  onDeleteSession,
  onClearAllSessions,
  onClose
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [sessionToDelete, setSessionToDelete] = useState<ChatSession | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState<boolean>(false);

  const groups = useMemo(() => groupByDay(sessions, (s) => s.updatedAt), [sessions]);

  const startRename = (s: ChatSession) => {
    setEditingId(s.id);
    setEditingTitle(s.title);
  };

  const saveRename = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (editingTitle.trim()) onRenameSession(id, editingTitle.trim());
    setEditingId(null);
  };

  const confirmDeleteSingle = () => {
    if (sessionToDelete) {
      onDeleteSession(sessionToDelete.id);
      setSessionToDelete(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container history-modal glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <MessageSquare className="modal-icon" size={20} />
            <h3 id="history-title">Conversations</h3>
          </div>
          <div className="history-header-actions">
            <button type="button" className="history-new-btn" onClick={onCreateNewChat} aria-label="New chat">
              <Plus size={16} />
              <span>New chat</span>
            </button>
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close conversations">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="history-body">
          {sessions.length === 0 ? (
            <div className="history-empty">
              <p>No conversations yet.</p>
              <span>Start one with New chat.</span>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="history-group" aria-label={group.label}>
                <h4 className="history-group-label">{group.label}</h4>
                <ul className="history-list">
                  {group.items.map((s) => {
                    const isActive = s.id === activeSessionId;
                    const title = s.title || 'New conversation';

                    if (s.id === editingId) {
                      return (
                        <li key={s.id} className="history-row is-editing">
                          <form className="history-rename" onSubmit={(e) => saveRename(e, s.id)}>
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); } }}
                              className="history-rename-input"
                              autoFocus
                              aria-label="Conversation title"
                            />
                            <button type="submit" className="history-icon-btn" aria-label="Save title">
                              <Check size={15} />
                            </button>
                            <button type="button" className="history-icon-btn" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                              <X size={15} />
                            </button>
                          </form>
                        </li>
                      );
                    }

                    return (
                      <li key={s.id} className={`history-row ${isActive ? 'active' : ''}`}>
                        <button
                          type="button"
                          className="history-row-main"
                          onClick={() => onSelectSession(s.id)}
                          aria-current={isActive ? 'true' : undefined}
                        >
                          <span className="history-row-title">{title}</span>
                          <span className="history-row-time">{formatShortTime(s.updatedAt)}</span>
                        </button>
                        <div className="history-row-actions">
                          <button type="button" className="history-icon-btn" onClick={() => startRename(s)} aria-label={`Rename ${title}`}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="history-icon-btn is-danger" onClick={() => setSessionToDelete(s)} aria-label={`Delete ${title}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {sessions.length > 0 && (
          <div className="history-footer">
            <button type="button" className="history-clear-link" onClick={() => setShowClearAllConfirm(true)}>
              Clear all history
            </button>
          </div>
        )}

        {sessionToDelete && (
          <div className="history-confirm-overlay" onClick={() => setSessionToDelete(null)}>
            <div className="history-confirm glass-panel" role="alertdialog" aria-labelledby="confirm-delete-title" onClick={(e) => e.stopPropagation()}>
              <AlertTriangle size={24} className="history-confirm-icon" />
              <h3 id="confirm-delete-title">Delete this conversation?</h3>
              <p><strong>"{sessionToDelete.title}"</strong> will be removed. This can't be undone.</p>
              <div className="history-confirm-actions">
                <button type="button" className="btn-cancel" onClick={() => setSessionToDelete(null)} autoFocus>Cancel</button>
                <button type="button" className="history-danger-btn" onClick={confirmDeleteSingle}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {showClearAllConfirm && (
          <div className="history-confirm-overlay" onClick={() => setShowClearAllConfirm(false)}>
            <div className="history-confirm glass-panel" role="alertdialog" aria-labelledby="confirm-clear-title" onClick={(e) => e.stopPropagation()}>
              <AlertTriangle size={24} className="history-confirm-icon" />
              <h3 id="confirm-clear-title">Clear all history?</h3>
              <p>All saved conversations will be permanently erased.</p>
              <div className="history-confirm-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowClearAllConfirm(false)} autoFocus>Cancel</button>
                <button
                  type="button"
                  className="history-danger-btn"
                  onClick={() => {
                    onClearAllSessions();
                    setShowClearAllConfirm(false);
                  }}
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
