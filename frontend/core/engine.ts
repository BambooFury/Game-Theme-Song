import type { Settings, CacheInfo } from './types';
import { getThemeAudio, rerollTheme, invalidateAudio, getBackendSettings } from './api';
import { warn, reportError } from './log';

const DEFAULTS: Settings = {
  enabled: true,
  volume: 0.35,
  fade_seconds: 1.5,
  search_suffix: ' theme song',
  loop: true,
  max_seconds: 0,
  stop_on_launch: true,
};

export const state: { settings: Settings } = { settings: { ...DEFAULTS } };

let audioEl: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let activeSeq = 0;
let currentAppId: number | null = null;

export function getAudioEl(): HTMLAudioElement | null {
  return audioEl;
}

export function getCurrentAppId(): number | null {
  return currentAppId;
}

export async function loadSettingsOnce() {
  try {
    const raw = await getBackendSettings();
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (s && typeof s === 'object') {
      state.settings = { ...state.settings, ...s };
      if (audioEl) audioEl.volume = state.settings.volume;
    }
  } catch (e) {
    warn('failed to load settings on start', e);
  }
}

let limitStopping = false;

function applyLimit(a: HTMLAudioElement) {
  const limit = state.settings.max_seconds;
  if (limit <= 0 || a.paused || a.currentTime < limit) return;
  if (state.settings.loop) {
    a.currentTime = 0;
  } else if (!limitStopping) {
    limitStopping = true;
    stopAudio();
  }
}

function ensureAudio(): HTMLAudioElement {
  if (audioEl && document.body.contains(audioEl)) return audioEl;
  const a = document.createElement('audio');
  a.id = 'game-theme-song-audio';
  a.preload = 'none';
  a.loop = state.settings.loop;
  a.style.display = 'none';
  a.ontimeupdate = () => applyLimit(a);
  document.body.appendChild(a);
  audioEl = a;
  return a;
}

function clearFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fadeTo(target: number, durationSec: number, onComplete?: () => void) {
  const a = ensureAudio();
  clearFade();
  const start = a.volume;
  const ticks = Math.max(1, Math.floor(durationSec * 30));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    a.volume = Math.max(0, Math.min(1, start + (target - start) * (i / ticks)));
    if (i >= ticks) {
      clearFade();
      onComplete?.();
    }
  }, (durationSec * 1000) / ticks);
}

export function stopAudio(durationSec = state.settings.fade_seconds) {
  if (!audioEl) return;
  audioEl.onerror = null;
  fadeTo(0, durationSec, () => {
    if (audioEl) audioEl.pause();
  });
}

async function probeUrl(url: string) {
  try {
    const r = await fetch(url);
    const buf = new Uint8Array(await r.arrayBuffer());
    const hex = Array.from(buf.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    reportError(`probe status=${r.status} type=${r.headers.get('content-type')} size=${buf.length} head=${hex}`);
  } catch (e: any) {
    reportError(`probe failed: ${e?.name ?? ''} ${e?.message ?? e}`);
  }
}

async function playUrl(url: string, mySeq: number, active: () => number): Promise<boolean> {
  if (mySeq !== active()) return false;
  limitStopping = false;
  const a = ensureAudio();
  clearFade();
  a.onerror = () => {
    const err = a.error;
    reportError(`audio element error: code=${err?.code ?? '?'} message=${err?.message ?? ''} networkState=${a.networkState} readyState=${a.readyState}`);
  };
  a.volume = 0;
  a.muted = false;
  if (a.src !== url) {
    a.pause();
    a.src = url;
    a.load();
  }
  a.loop = state.settings.loop;
  const tryPlay = async (): Promise<string> => {
    try {
      await a.play();
      return 'ok';
    } catch (e: any) {
      return `${e?.name ?? 'Error'}: ${e?.message ?? e}`;
    }
  };
  let result = await tryPlay();
  if (result !== 'ok' && result.startsWith('NotAllowedError')) {
    a.muted = true;
    result = await tryPlay();
    if (result === 'ok') a.muted = false;
  }
  if (result !== 'ok') {
    reportError(`audio play failed: ${result} (mediaError=${a.error?.code ?? 'none'})`);
    void probeUrl(url);
    return false;
  }
  if (mySeq !== active()) {
    a.pause();
    return false;
  }
  fadeTo(state.settings.volume, state.settings.fade_seconds);
  return true;
}

async function resolveGameName(appId: number): Promise<string | null> {
  const tryOnce = (): string | null => {
    try {
      const o = (window as any).appStore?.GetAppOverviewByAppID?.(appId);
      if (o) return o.display_name ?? o.appname ?? null;
    } catch {}
    try {
      const a = (window as any).collectionStore?.GetAppDetailsForAppID?.(appId);
      if (a?.strDisplayName) return a.strDisplayName;
    } catch {}
    return null;
  };
  let name = tryOnce();
  for (let i = 0; i < 10 && !name; i++) {
    await new Promise(r => setTimeout(r, 150));
    name = tryOnce();
  }
  return name;
}

export type ToastMode = 'off' | 'searching' | 'ready';
export interface ToastState { mode: ToastMode; title: string | null }

let toastMode: ToastMode = 'off';
let toastTitle: string | null = null;
let toastListeners: ((s: ToastState) => void)[] = [];

function setToast(mode: ToastMode, title: string | null = toastTitle) {
  toastMode = mode;
  toastTitle = title;
  const snapshot: ToastState = { mode, title };
  for (const fn of toastListeners) fn(snapshot);
}

export function getToast(): ToastState {
  return { mode: toastMode, title: toastTitle };
}

export function getToastMode(): ToastMode {
  return toastMode;
}

export function subscribeToast(fn: (s: ToastState) => void): () => void {
  toastListeners.push(fn);
  return () => { toastListeners = toastListeners.filter((x) => x !== fn); };
}

let currentGameName: string | null = null;
let currentTitle: string | null = null;
let currentUrl: string | null = null;
let rerollExclude: string[] = [];

async function resolveAndPlay(
  appId: number,
  name: string,
  mySeq: number,
  getSeq: () => number,
  exclude: string[],
): Promise<{ ok: boolean; title: string | null; url: string | null; cached: boolean }> {
  const rerolling = exclude.length > 0;
  const excludeArg = JSON.stringify(exclude);
  let resp: any;
  try {
    const raw = rerolling
      ? await rerollTheme({ app_id: appId, game_name: name, force_refresh: true, exclude: excludeArg })
      : await getThemeAudio({ app_id: appId, game_name: name, force_refresh: false });
    resp = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    warn('backend error', e);
    return { ok: false, title: null, url: null, cached: false };
  }
  if (mySeq !== getSeq()) return { ok: false, title: null, url: null, cached: false };
  if (!resp?.ok || !resp.url) {
    warn('no audio for', name, resp?.error);
    return { ok: false, title: null, url: null, cached: false };
  }

  const ok = await playUrl(resp.url, mySeq, getSeq);
  if (ok || mySeq !== getSeq()) return { ok, title: resp.title ?? null, url: ok ? resp.url : null, cached: !!resp.cached };

  await invalidateAudio({ app_id: appId });
  const raw2 = rerolling
    ? await rerollTheme({ app_id: appId, game_name: name, force_refresh: true, exclude: excludeArg })
    : await getThemeAudio({ app_id: appId, game_name: name, force_refresh: true });
  const r2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
  if (mySeq !== getSeq() || !r2?.ok || !r2.url) return { ok: false, title: null, url: null, cached: false };
  const ok2 = await playUrl(r2.url, mySeq, getSeq);
  return { ok: ok2, title: r2.title ?? null, url: ok2 ? r2.url : null, cached: false };
}

export async function rerollCurrent(): Promise<void> {
  const appId = currentAppId;
  const name = currentGameName;
  if (appId == null || !name) return;
  if (toastMode === 'searching') return;
  if (currentTitle) rerollExclude = [...rerollExclude, currentTitle];
  const mySeq = ++activeSeq;
  const getSeq = () => activeSeq;
  stopAudio(0.25);
  setToast('searching');
  try {
    const { ok, title, url } = await resolveAndPlay(appId, name, mySeq, getSeq, rerollExclude);
    if (mySeq !== activeSeq) return;
    if (ok) {
      currentTitle = title;
      currentUrl = url;
      setToast('ready', title);
    } else {
      if (currentUrl) await playUrl(currentUrl, mySeq, getSeq);
      if (mySeq === activeSeq) setToast('ready', currentTitle);
    }
  } catch (e) {
    warn('rerollCurrent failed', e);
    if (mySeq === activeSeq) {
      if (currentUrl) await playUrl(currentUrl, mySeq, getSeq);
      setToast('ready', currentTitle);
    }
  }
}

export function acceptCurrent(): void {
  setToast('off');
}

let libWindowOpen = false;
let libWindowListeners: ((open: boolean) => void)[] = [];

export function setLibWindowOpen(open: boolean) {
  if (libWindowOpen === open) return;
  libWindowOpen = open;
  for (const fn of libWindowListeners) fn(open);
}

export function getLibWindowOpen(): boolean {
  return libWindowOpen;
}

export function subscribeLibWindow(fn: (open: boolean) => void): () => void {
  libWindowListeners.push(fn);
  return () => { libWindowListeners = libWindowListeners.filter((x) => x !== fn); };
}

let gCustomCount: number | null = null;
let gCustomCountListeners: ((n: number | null) => void)[] = [];

export function setGlobalCustomCount(n: number | null) {
  gCustomCount = n;
  for (const fn of gCustomCountListeners) fn(n);
}

export function getCustomCount(): number | null {
  return gCustomCount;
}

export function subscribeCustomCount(fn: (n: number | null) => void): () => void {
  gCustomCountListeners.push(fn);
  return () => { gCustomCountListeners = gCustomCountListeners.filter((x) => x !== fn); };
}

let cacheWindowOpen = false;
let cacheWindowListeners: ((open: boolean) => void)[] = [];

export function setCacheWindowOpen(open: boolean) {
  if (cacheWindowOpen === open) return;
  cacheWindowOpen = open;
  for (const fn of cacheWindowListeners) fn(open);
}

export function getCacheWindowOpen(): boolean {
  return cacheWindowOpen;
}

export function subscribeCacheWindow(fn: (open: boolean) => void): () => void {
  cacheWindowListeners.push(fn);
  return () => { cacheWindowListeners = cacheWindowListeners.filter((x) => x !== fn); };
}

let gCacheInfoListeners: ((info: CacheInfo) => void)[] = [];

export function setGlobalCacheInfo(info: CacheInfo) {
  for (const fn of gCacheInfoListeners) fn(info);
}

export function subscribeCacheInfo(fn: (info: CacheInfo) => void): () => void {
  gCacheInfoListeners.push(fn);
  return () => { gCacheInfoListeners = gCacheInfoListeners.filter((x) => x !== fn); };
}

async function playForApp(appId: number) {
  let mySeq = -1;
  try {
    if (!state.settings.enabled) return;
    if (currentAppId === appId && audioEl && !audioEl.paused) return;
    currentAppId = appId;
    mySeq = ++activeSeq;
    const getSeq = () => activeSeq;
    currentGameName = null;
    currentTitle = null;
    currentUrl = null;
    rerollExclude = [];
    const name = await resolveGameName(appId);
    if (mySeq !== activeSeq) return;
    if (!name) { warn('no name for', appId); return; }
    currentGameName = name;

    let searchingShown = false;
    const searchingTimer = setTimeout(() => {
      if (mySeq === activeSeq) { searchingShown = true; setToast('searching', null); }
    }, 350);

    const { ok, title, url, cached } = await resolveAndPlay(appId, name, mySeq, getSeq, []);
    clearTimeout(searchingTimer);
    if (mySeq !== activeSeq) return;
    if (ok) {
      currentTitle = title;
      currentUrl = url;
      if (cached && !searchingShown) setToast('off');
      else setToast('ready', title);
    } else {
      setToast('off');
    }
  } catch (e) {
    warn('playForApp crashed', e);
    if (mySeq === activeSeq) setToast('off');
  }
}

function parseAppId(value: unknown): number | null {
  const text = String(value ?? '');
  const m = text.match(/\/library\/app\/(\d+)/) || text.match(/[?&]appid=(\d+)/i) || text.match(/[?&]app_id=(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function detectAppId(): number | null {
  try {
    const wins: any = (globalThis as any).SteamUIStore?.WindowStore?.SteamUIWindows ?? [];
    for (const w of wins) {
      const params = w?.m_params;
      if (params && typeof params === 'object') {
        const appid = params.appid ?? params.appId ?? params.AppID ?? params.unAppID;
        if (appid && /^\d+$/.test(String(appid))) return parseInt(String(appid), 10);
      }
      for (const value of [w?.m_locationPathname, w?.m_strURL, w?.m_url, w?.m_history?.location?.pathname, w?.m_history?.location?.search]) {
        const id = parseAppId(value);
        if (id) return id;
      }
    }
  } catch {}
  try {
    for (const value of [window.location.href, document.location?.href]) {
      const id = parseAppId(value);
      if (id) return id;
    }
  } catch {}
  return null;
}

const POLL_MS = 500;
const NAV_DEBOUNCE_MS = 800;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let navDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastDetectedAppId: number | null = null;

function pollOnce() {
  let id: number | null = null;
  try { id = detectAppId(); } catch { return; }
  if (id === lastDetectedAppId) return;
  lastDetectedAppId = id;

  if (id !== currentAppId) {
    stopAudio();
    ++activeSeq;
  }
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    navDebounceTimer = null;
    const finalId = detectAppId();
    if (finalId === currentAppId) return;
    if (finalId === null) { currentAppId = null; setToast('off'); }
    else void playForApp(finalId);
  }, NAV_DEBOUNCE_MS);
}

export function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, POLL_MS);
  setTimeout(pollOnce, 100);
}

let launchHook: { unregister?: () => void } | null = null;

export function registerLaunchStop() {
  try {
    const sc = (window as any).SteamClient;
    if (!sc?.Apps?.RegisterForGameActionStart) {
      warn('RegisterForGameActionStart unavailable');
      return;
    }
    launchHook = sc.Apps.RegisterForGameActionStart(() => {
      if (state.settings.stop_on_launch) stopAudio(0.4);
    });
  } catch (e) {
    warn('failed to register launch listener', e);
  }
}

export function unregisterLaunchStop() {
  launchHook?.unregister?.();
}

export function resetPlayback() {
  currentAppId = null;
  lastDetectedAppId = null;
}

export async function reapplyForApp(appId: number) {
  try {
    if (currentAppId !== appId) return;
    currentAppId = null;
    lastDetectedAppId = null;
    ++activeSeq;
    stopAudio(0.25);
    await new Promise((r) => setTimeout(r, 320));
    await playForApp(appId);
  } catch (e) {
    warn('reapplyForApp failed', e);
  }
}
