import { logFrontend } from './api';

export const warn = (...a: unknown[]) => console.warn('[GameThemeSong]', ...a);

export const reportError = (message: string) => {
  warn(message);
  void logFrontend({ message }).catch(() => {});
};
