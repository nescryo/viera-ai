import React, { useState } from 'react';
import type { ChatSession } from '../../types';
import { Plus, Trash2, Edit2, Check, X, MessageSquare, AlertTriangle } from 'lucide-react';

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

  const formatRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const handleStartRename = (e: React.MouseEvent, s: ChatSession) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditingTitle(s.title);
  };

  const handleSaveRename = (e: React.MouseEvent | React.FormEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (editingTitle.trim()) {
      onRenameSession(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, s: ChatSession) => {
    e.stopPropagation();
    setSessionToDelete(s);
  };

  const confirmDeleteSingle = () => {
    if (sessionToDelete) {
      onDeleteSession(sessionToDelete.id);
      setSessionToDelete(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container history-modal-card glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Top Header Row (Project Airi Concept) */}
        <div className="history-modal-header">
          <div className="title-with-icon">
            <MessageSquare size={20} className="header-icon-teal" />
            <h2 className="modal-title">Conversations</h2>
          </div>
          
          <button className="new-chat-btn-top" onClick={onCreateNewChat} aria-label="Create new conversation">
            <Plus size={16} />
            <span>+ New</span>
          </button>
        </div>

        {/* Scrollable Sessions List */}
        <div className="history-sessions-list custom-scrollbar">
          {sessions.length === 0 ? (
            <div className="empty-history-state">
              <MessageSquare size={32} className="empty-icon" />
              <p>No past conversations found.</p>
              <span>Click "+ New" to start chatting with Firefly!</span>
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const isEditing = s.id === editingId;

              return (
                <div
                  key={s.id}
                  className={`history-card-item ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectSession(s.id)}
                >
                  <div className="card-main-info">
                    {isEditing ? (
                      <form onSubmit={(e) => handleSaveRename(e, s.id)} className="rename-form" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="rename-input glass-input"
                          autoFocus
                          aria-label="Edit session title"
                        />
                        <button type="submit" className="card-action-btn check-btn" title="Save" aria-label="Save new title">
                          <Check size={14} />
                        </button>
                        <button type="button" className="card-action-btn cancel-btn" onClick={() => setEditingId(null)} title="Cancel" aria-label="Cancel editing">
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <h4 className="session-card-title">{s.title || 'New conversation'}</h4>
                        <span className="session-card-time">{formatRelativeTime(s.updatedAt)}</span>
                      </>
                    )}
                  </div>

                  <div className="card-right-actions">
                    <span className="provider-badge">
                      {(s.provider || 'AI').toUpperCase()}
                    </span>

                    {!isEditing && (
                      <div className="hover-actions-group">
                        <button
                          className="card-action-btn edit-btn"
                          onClick={(e) => handleStartRename(e, s)}
                          title="Rename Session"
                          aria-label={`Rename session ${s.title}`}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="card-action-btn delete-btn"
                          onClick={(e) => handleDeleteClick(e, s)}
                          title="Delete Session"
                          aria-label={`Delete session ${s.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="history-modal-footer">
          {sessions.length > 0 && (
            <button
              className="clear-all-btn"
              onClick={() => setShowClearAllConfirm(true)}
              aria-label="Clear all conversation history"
            >
              <Trash2 size={14} />
              <span>Clear All History</span>
            </button>
          )}

          <button className="modal-close-btn-ghost" onClick={onClose} aria-label="Close modal">
            Close
          </button>
        </div>

        {/* Single Session Delete Confirmation Sub-modal */}
        {sessionToDelete && (
          <div className="inner-confirm-overlay" onClick={() => setSessionToDelete(null)}>
            <div className="inner-confirm-card glass-panel" onClick={(e) => e.stopPropagation()}>
              <AlertTriangle size={28} className="warn-icon-yellow" />
              <h3>Delete Conversation?</h3>
              <p>Are you sure you want to delete <strong>"{sessionToDelete.title}"</strong>? This action cannot be undone.</p>
              <div className="confirm-btn-group">
                <button className="cancel-confirm-btn" onClick={() => setSessionToDelete(null)}>
                  Cancel
                </button>
                <button className="delete-confirm-btn" onClick={confirmDeleteSingle}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear All Sessions Confirmation Sub-modal */}
        {showClearAllConfirm && (
          <div className="inner-confirm-overlay" onClick={() => setShowClearAllConfirm(false)}>
            <div className="inner-confirm-card glass-panel" onClick={(e) => e.stopPropagation()}>
              <AlertTriangle size={28} className="warn-icon-red" />
              <h3>Clear All History?</h3>
              <p>This will permanently erase all your saved conversation sessions. Are you sure?</p>
              <div className="confirm-btn-group">
                <button className="cancel-confirm-btn" onClick={() => setShowClearAllConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="delete-confirm-btn danger"
                  onClick={() => {
                    onClearAllSessions();
                    setShowClearAllConfirm(false);
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
