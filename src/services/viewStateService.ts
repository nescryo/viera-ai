export type AppView = 'chat' | 'chess';

function getViewKey(userId: string): string {
  return `viera_view_${userId}`;
}

/** Last screen the user was on, so a browser refresh can return to it. Defaults to `chat`. */
export function getSavedView(userId: string): AppView {
  if (!userId) return 'chat';
  try {
    return localStorage.getItem(getViewKey(userId)) === 'chess' ? 'chess' : 'chat';
  } catch {
    return 'chat';
  }
}

export function saveView(userId: string | undefined, view: AppView): void {
  if (!userId) return;
  try {
    localStorage.setItem(getViewKey(userId), view);
  } catch (e) {
    console.warn('Failed to save view state:', e);
  }
}
