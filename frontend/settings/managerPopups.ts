import { setCacheWindowOpen, setLibWindowOpen } from '../core/engine';

export type ManagerPopup = 'library' | 'cache' | 'main';

let open: Record<ManagerPopup, boolean> = { library: false, cache: false, main: false };
let listeners: ((state: Record<ManagerPopup, boolean>) => void)[] = [];

function publish() {
  const snapshot = { ...open };
  for (const fn of listeners) fn(snapshot);
}

export function subscribeManagerPopups(fn: (state: Record<ManagerPopup, boolean>) => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter((x) => x !== fn); };
}

export function openManagerPopup(kind: ManagerPopup): void {
  if (open[kind]) return;
  open = { ...open, [kind]: true };
  if (kind === 'library') setLibWindowOpen(true);
  if (kind === 'cache') setCacheWindowOpen(true);
  publish();
}

export function closeManagerPopup(kind: ManagerPopup): void {
  if (!open[kind]) return;
  open = { ...open, [kind]: false };
  if (kind === 'library') setLibWindowOpen(false);
  if (kind === 'cache') setCacheWindowOpen(false);
  publish();
}