import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { ChatSession } from '../src/types';
import {
  mergeSessions,
  sessionToRow,
  rowToSession,
  tombstoneRow,
  selectSessionsToPush,
  getTombstones,
  addTombstones,
  clearTombstones,
  isCloudSyncEnabled,
  setCloudSyncEnabled,
} from '../src/services/chatSyncService';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

function session(id: string, updatedAt: number, overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id,
    title: `Chat ${id}`,
    characterId: 'deepseek-chan',
    createdAt: Number(id),
    updatedAt,
    messages: [{ id: `m${id}`, sender: 'user', characterId: 'deepseek-chan', text: 'hi', timestamp: '2026-01-01T00:00:00Z' }],
    ...overrides,
  };
}

describe('sessionToRow / rowToSession', () => {
  it('round-trips a session with optional fields', () => {
    const s = session('100', 200, { summary: 'sum', lastSummarizedIndex: 3, currentEmotion: 'happy', provider: 'openrouter' });
    expect(rowToSession(sessionToRow(s))).toEqual(s);
  });

  it('omits empty optional fields', () => {
    const s = session('100', 200);
    expect(rowToSession(sessionToRow(s))).toEqual(s);
  });
});

describe('mergeSessions', () => {
  it('keeps local-only sessions', () => {
    const local = [session('1', 10)];
    expect(mergeSessions(local, [], {})).toEqual(local);
  });

  it('adds remote-only sessions', () => {
    const remote = sessionToRow(session('2', 20));
    expect(mergeSessions([], [remote], {})).toEqual([rowToSession(remote)]);
  });

  it('newer remote wins over local', () => {
    const local = session('1', 10, { title: 'old' });
    const remote = sessionToRow(session('1', 20, { title: 'new' }));
    expect(mergeSessions([local], [remote], {})[0].title).toBe('new');
  });

  it('newer local wins and keeps object identity', () => {
    const local = session('1', 30, { title: 'local' });
    const remote = sessionToRow(session('1', 20, { title: 'remote' }));
    expect(mergeSessions([local], [remote], {})[0]).toBe(local);
  });

  it('remote deletion removes an older local session', () => {
    expect(mergeSessions([session('1', 10)], [tombstoneRow('1', 15)], {})).toEqual([]);
  });

  it('local edit after remote deletion keeps the session', () => {
    const local = session('1', 20);
    expect(mergeSessions([local], [tombstoneRow('1', 15)], {})).toEqual([local]);
  });

  it('local tombstone hides a remote session not edited since', () => {
    const remote = sessionToRow(session('2', 20));
    expect(mergeSessions([], [remote], { '2': 25 })).toEqual([]);
  });

  it('remote edit after local tombstone brings the session back', () => {
    const remote = sessionToRow(session('2', 30));
    expect(mergeSessions([], [remote], { '2': 25 })).toHaveLength(1);
  });

  it('sorts newest-created first', () => {
    const merged = mergeSessions([session('1', 10)], [sessionToRow(session('3', 30))], {});
    expect(merged.map((s) => s.id)).toEqual(['3', '1']);
  });
});

describe('selectSessionsToPush', () => {
  it('skips empty and already-pushed sessions', () => {
    const empty = session('1', 10, { messages: [] });
    const pushed = session('2', 20);
    const changed = session('3', 30);
    const pushedAt = new Map([['2', 20], ['3', 25]]);
    expect(selectSessionsToPush([empty, pushed, changed], pushedAt)).toEqual([changed]);
  });

  it('includes sessions with chess games even when messages are empty', () => {
    const chessOnly = session('4', 40, {
      messages: [],
      chessGames: [
        {
          id: 'g1',
          difficultyId: 'beginner',
          userColor: 'w',
          entries: [{ san: 'e4', by: 'user', from: 'e2', to: 'e4', flags: 'b' }],
          resigned: false,
          startedAt: 100,
          updatedAt: 150,
        },
      ],
    });
    expect(selectSessionsToPush([chessOnly], new Map())).toEqual([chessOnly]);
  });
});

describe('tombstones', () => {
  it('returns an empty map when nothing is stored', () => {
    expect(getTombstones('u1')).toEqual({});
  });

  it('adds and merges deletion timestamps per session ID', () => {
    addTombstones('u1', ['s1'], 1000);
    addTombstones('u1', ['s2', 's3'], 2000);
    addTombstones('u1', [], 3000);
    expect(getTombstones('u1')).toEqual({ s1: 1000, s2: 2000, s3: 2000 });
  });

  it('clears specific IDs and removes the storage key when empty', () => {
    addTombstones('u1', ['s1', 's2'], 1000);
    clearTombstones('u1', ['s1']);
    expect(getTombstones('u1')).toEqual({ s2: 1000 });
    expect(storage.has('viera_sync_tombstones_u1')).toBe(true);

    clearTombstones('u1', ['s2']);
    expect(getTombstones('u1')).toEqual({});
    expect(storage.has('viera_sync_tombstones_u1')).toBe(false);
  });
});

describe('cloud sync preference', () => {
  it('defaults to false and persists opt-in state per user', () => {
    expect(isCloudSyncEnabled('u1')).toBe(false);

    setCloudSyncEnabled('u1', true);
    expect(isCloudSyncEnabled('u1')).toBe(true);
    expect(storage.get('viera_cloud_sync_u1')).toBe('1');
    expect(isCloudSyncEnabled('u2')).toBe(false);

    setCloudSyncEnabled('u1', false);
    expect(isCloudSyncEnabled('u1')).toBe(false);
    expect(storage.has('viera_cloud_sync_u1')).toBe(false);
  });
});
