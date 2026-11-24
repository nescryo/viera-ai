import type { ChatSession } from '../types';
import { getSupabaseClient } from './authService';

const TABLE = 'chat_sessions';

/** A row of the `chat_sessions` table in Supabase. */
export interface RemoteSessionRow {
  id: string;
  title: string;
  character_id: string;
  provider: string | null;
  summary: string | null;
  last_summarized_index: number | null;
  current_emotion: string | null;
  messages: ChatSession['messages'];
  chess_games: NonNullable<ChatSession['chessGames']>;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Session IDs deleted on this device and not yet sent to Supabase, mapped to the deletion time. */
export type Tombstones = Record<string, number>;

function getTombstonesKey(userId: string): string {
  return `viera_sync_tombstones_${userId}`;
}

/** Convert a local session to a Supabase row. */
export function sessionToRow(session: ChatSession): RemoteSessionRow {
  return {
    id: session.id,
    title: session.title,
    character_id: session.characterId,
    provider: session.provider ?? null,
    summary: session.summary ?? null,
    last_summarized_index: session.lastSummarizedIndex ?? null,
    current_emotion: session.currentEmotion ?? null,
    messages: session.messages,
    chess_games: session.chessGames ?? [],
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    deleted_at: null,
  };
}

/** Build a deletion row. Content is blanked so deleted chats do not stay on the server. */
export function tombstoneRow(id: string, deletedAt: number): RemoteSessionRow {
  return {
    id,
    title: '',
    character_id: '',
    provider: null,
    summary: null,
    last_summarized_index: null,
    current_emotion: null,
    messages: [],
    chess_games: [],
    created_at: deletedAt,
    updated_at: deletedAt,
    deleted_at: deletedAt,
  };
}

/** Convert a Supabase row back to a local session. */
export function rowToSession(row: RemoteSessionRow): ChatSession {
  const session: ChatSession = {
    id: row.id,
    title: row.title,
    characterId: row.character_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
  if (row.provider !== null) session.provider = row.provider;
  if (row.summary !== null) session.summary = row.summary;
  if (row.last_summarized_index !== null) session.lastSummarizedIndex = row.last_summarized_index;
  if (row.current_emotion !== null) session.currentEmotion = row.current_emotion;
  if (Array.isArray(row.chess_games) && row.chess_games.length > 0) session.chessGames = row.chess_games;
  return session;
}

/**
 * Merge local sessions with Supabase rows. For each session the newer `updatedAt` wins.
 * A deletion (local tombstone or remote `deleted_at`) wins unless the session was edited after it.
 * Local objects are returned unchanged when local wins, so callers can detect changes by identity.
 * The result is sorted newest-created first, matching `historyService`.
 */
export function mergeSessions(
  local: ChatSession[],
  remote: RemoteSessionRow[],
  tombstones: Tombstones
): ChatSession[] {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const merged = new Map<string, ChatSession>();

  for (const session of local) {
    const row = remoteById.get(session.id);
    if (!row) {
      merged.set(session.id, session);
    } else if (row.deleted_at !== null) {
      if (session.updatedAt > Number(row.deleted_at)) merged.set(session.id, session);
    } else {
      merged.set(session.id, Number(row.updated_at) > session.updatedAt ? rowToSession(row) : session);
    }
  }

  for (const row of remote) {
    if (merged.has(row.id) || row.deleted_at !== null) continue;
    if (local.some((s) => s.id === row.id)) continue;
    const deletedAt = tombstones[row.id];
    if (deletedAt !== undefined && deletedAt >= Number(row.updated_at)) continue;
    merged.set(row.id, rowToSession(row));
  }

  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Read pending local deletions. */
export function getTombstones(userId: string): Tombstones {
  try {
    const raw = localStorage.getItem(getTombstonesKey(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    return parsed && typeof parsed === 'object' ? parsed as Tombstones : {};
  } catch {
    return {};
  }
}

/** Record local deletions so they reach Supabase on the next push. */
export function addTombstones(userId: string, ids: string[], deletedAt: number = Date.now()): void {
  if (ids.length === 0) return;
  const tombstones = getTombstones(userId);
  for (const id of ids) tombstones[id] = deletedAt;
  try {
    localStorage.setItem(getTombstonesKey(userId), JSON.stringify(tombstones));
  } catch (e) {
    console.warn('[Viera Sync] Could not record deleted sessions.', e);
  }
}

/** Forget deletions that were sent to Supabase. */
export function clearTombstones(userId: string, ids: string[]): void {
  const tombstones = getTombstones(userId);
  for (const id of ids) delete tombstones[id];
  try {
    if (Object.keys(tombstones).length === 0) localStorage.removeItem(getTombstonesKey(userId));
    else localStorage.setItem(getTombstonesKey(userId), JSON.stringify(tombstones));
  } catch {
    // Ignore: tombstones are resent next time.
  }
}

/** Sessions worth uploading: changed since the last push and not empty. */
export function selectSessionsToPush(sessions: ChatSession[], pushedAt: Map<string, number>): ChatSession[] {
  return sessions.filter((s) =>
    (s.messages.length > 0 || (s.chessGames?.length ?? 0) > 0) && pushedAt.get(s.id) !== s.updatedAt
  );
}

function getEnabledKey(userId: string): string {
  return `viera_cloud_sync_${userId}`;
}

/** Whether the user opted in to cloud sync on this device. Off by default. */
export function isCloudSyncEnabled(userId: string): boolean {
  try {
    return localStorage.getItem(getEnabledKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Save the user's cloud sync choice on this device. */
export function setCloudSyncEnabled(userId: string, enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(getEnabledKey(userId), '1');
    else localStorage.removeItem(getEnabledKey(userId));
  } catch {
    console.warn('[Viera Sync] Could not save the cloud sync setting.');
  }
}

/** True when Supabase is configured in this build. */
export function isCloudSyncAvailable(): boolean {
  return getSupabaseClient() !== null;
}

/** Fetch all of the signed-in user's rows, including deletions. */
export async function fetchRemoteSessions(userId: string): Promise<RemoteSessionRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,title,character_id,provider,summary,last_summarized_index,current_emotion,messages,chess_games,created_at,updated_at,deleted_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as RemoteSessionRow[];
}

/** Upsert changed sessions and pending deletions. Row-level security rejects any other `user_id`. */
export async function pushChanges(userId: string, sessions: ChatSession[], tombstones: Tombstones): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const rows = [
    ...sessions.map(sessionToRow),
    ...Object.entries(tombstones).map(([id, deletedAt]) => tombstoneRow(id, deletedAt)),
  ].map((row) => ({ ...row, user_id: userId }));
  if (rows.length === 0) return;
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'user_id,id' });
  if (error) throw error;
}
