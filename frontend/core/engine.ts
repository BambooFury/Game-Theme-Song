import type { Settings, CacheInfo } from './types';
import { getThemeAudio, rerollTheme, invalidateAudio, getBackendSettings } from './api';
import { warn } from './log';

const DEFAULTS: Settings = {
  enabled: true,
  volume: 0.35,
  fade_seconds: 1.5,
  search_suffix: ' theme song',
  loop: true,
  max_seconds: 0,
  stop_on_launch: true,
  manual_search: true,
  confirm_before_download: true,
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

async function playUrl(url: string, mySeq: number, active: () => number): Promise<boolean> {
  if (mySeq !== active()) return false;
  limitStopping = false;
  const a = ensureAudio();
  clearFade();
  a.onerror = () => {
    const err = a.error;
    warn(`audio element error: code=${err?.code ?? '?'} message=${err?.message ?? ''} networkState=${a.networkState} readyState=${a.readyState}`);
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
    warn(`audio play failed: ${result} (mediaError=${a.error?.code ?? 'none'})`);
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
  let delay = 50;
  for (let i = 0; i < 7 && !name; i++) {
    await new Promise(r => setTimeout(r, delay));
    name = tryOnce();
    delay = Math.min(delay * 2, 500);
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
let pendingAppId: number | null

async function resolveAndPlay(
  appId: number,
  name: string,
  mySeq: number,
  getSeq: () => number,
  exclude: string[],
  onResolved?: (cached: boolean) => void,
  ): Promise<{ ok: boolean; title: string | null; url: string | null; cached: boolean; custom: boolean }> {
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
    return { ok: false, title: null, url: null, cached: false, custom: false };
  }
  if (resp && resp.ok === false && resp.error === 'busy') {
  await new Promise((r) => setTimeout(r, 1500));
  if (mySeq !== getSeq()) return { ok: false, title: null, url: null, cached: false, custom: false };
  try {
    const raw = rerolling
      ? await rerollTheme({ app_id: appId, game_name: name, force_refresh: true, exclude: excludeArg })
      : await getThemeAudio({ app_id: appId, game_name: name, force_refresh: false });
    resp = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    warn('backend retry error', e);
    return { ok: false, title: null, url: null, cached: false, custom: false };
  }
}
  if (mySeq !== getSeq()) return { ok: false, title: null, url: null, cached: false, custom: false };
  if (!resp?.ok || !resp.url) {
    warn('no audio for', name, resp?.error);
    return { ok: false, title: null, url: null, cached: false, custom: false };
  }
  onResolved?.(!!resp.cached);
  if (shouldSuppressPlayback(appId)) return { ok: false, title: null, url: null, cached: false, custom: false };
  const ok = await playUrl(resp.url, mySeq, getSeq);
  if (ok || mySeq !== getSeq()) return { ok, title: resp.title ?? null, url: ok ? resp.url : null, cached: !!resp.cached, custom: !!resp.custom };

  await invalidateAudio({ app_id: appId });
  const raw2 = rerolling
    ? await rerollTheme({ app_id: appId, game_name: name, force_refresh: true, exclude: excludeArg })
    : await getThemeAudio({ app_id: appId, game_name: name, force_refresh: true });
  const r2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
  if (mySeq !== getSeq() || !r2?.ok || !r2.url) return { ok: false, title: null, url: null, cached: false, custom: false };
const ok2 = await playUrl(r2.url, mySeq, getSeq);
return { ok: ok2, title: r2.title ?? null, url: ok2 ? r2.url : null, cached: false, custom: !!r2.custom };
}


const REROLL_DEBOUNCE_MS = 450;
let rerollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function rerollCurrent(): void {
  const appId = currentAppId;
  const name = currentGameName;
  if (appId == null || !name) return;
  if (!state.settings.manual_search) return;
  if (currentTitle && !rerollExclude.includes(currentTitle)) rerollExclude = [...rerollExclude, currentTitle];
  ++activeSeq;
  stopAudio(0.25);
  setToast('searching');
  if (rerollDebounceTimer != null) clearTimeout(rerollDebounceTimer);
  rerollDebounceTimer = setTimeout(() => {
    rerollDebounceTimer = null;
    void runReroll();
  }, REROLL_DEBOUNCE_MS);
}

async function runReroll(): Promise<void> {
  const appId = currentAppId;
  const name = currentGameName;
  if (appId == null || !name) return;
  const mySeq = activeSeq;
  const getSeq = () => activeSeq;
  try {
    const { ok, title, url } = await resolveAndPlay(appId, name, mySeq, getSeq, rerollExclude);
    if (mySeq !== activeSeq) return;
        if (ok) {
      currentTitle = title;
      currentUrl = url;
      pendingConfirmAppId = confirmModeOn() ? appId : null;
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

let pendingConfirmAppId: number | null = null;

function confirmModeOn(): boolean {
  return state.settings.manual_search && state.settings.confirm_before_download;
}

function discardPending(keepAppId: number | null = null) {
  const id = pendingConfirmAppId;
  if (id == null || id === keepAppId) return;
  pendingConfirmAppId = null;
  void invalidateAudio({ app_id: id }).catch((e) => warn('failed to discard pending song', e));
}

export function acceptCurrent(): void {
  pendingConfirmAppId = null;
  setToast('off');
}

export function getPendingConfirmAppId(): number | null {
  return pendingConfirmAppId;
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
    if (shouldSuppressPlayback(appId)) return;
    if (currentAppId === appId && audioEl && !audioEl.paused) return;
    if (pendingAppId != null && pendingAppId !== appId) {
      void invalidateAudio({ app_id: pendingAppId });
      pendingAppId = null;
    }
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

        const searchingTimer = setTimeout(() => {
  if (mySeq === activeSeq) setToast('searching', null);
}, 350);

        const { ok, title, url, cached } = await resolveAndPlay(appId, name, mySeq, getSeq, [], (isCached) => {
      if (isCached) {
        clearTimeout(searchingTimer);
        if (mySeq === activeSeq) setToast('off');
      }
    });
    clearTimeout(searchingTimer);
    if (mySeq !== activeSeq) return;
    if (ok) {
      currentTitle = title;
      currentUrl = url;
      pendingConfirmAppId = confirmModeOn() && !cached ? appId : null;
      if (!state.settings.manual_search) setToast('off');
      else if (cached) setToast('off');
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
const BOOT_GRACE_MS = 6000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let navDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastDetectedAppId: number | null = null;
let bootObserveUntil = 0;

function pollOnce() {
  let id: number | null = null;
  try { id = detectAppId(); } catch { return; }
  if (bootObserveUntil !== 0 && Date.now() < bootObserveUntil) {
    lastDetectedAppId = id;
    return;
  }
  if (id === lastDetectedAppId) return;
  lastDetectedAppId = id;

  if (id !== currentAppId) ++activeSeq;
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    navDebounceTimer = null;
    const finalId = detectAppId();
    if (finalId === currentAppId) return;
    discardPending(finalId);
    stopAudio();
    if (finalId === null) {
      if (pendingAppId != null) { void invalidateAudio({ app_id: pendingAppId }); pendingAppId = null; }
      currentAppId = null;
      setToast('off');
    }
    else void playForApp(finalId);
  }, NAV_DEBOUNCE_MS);
}

export function startPolling() {
  if (pollTimer) return;
  bootObserveUntil = Date.now() + BOOT_GRACE_MS;
  pollTimer = setInterval(pollOnce, POLL_MS);
  setTimeout(pollOnce, 100);
}

let launchHook: { unregister?: () => void } | null = null;
let lifetimeHook: { unregister?: () => void } | null = null;

const LAUNCH_SUPPRESS_MS = 15000;
const runningApps = new Set<number>();
let recentLaunchAppId: number | null = null;
let recentLaunchUntil = 0;

function parseLaunchAppId(...args: unknown[]): number | null {
  for (const a of args) {
    const n = Number(String(a ?? ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isAppRunningInStore(appId: number): boolean {
  try {
    const o = (window as any).appStore?.GetAppOverviewByAppID?.(appId);
    if (o?.BIsAppRunning?.() || o?.running) return true;
  } catch {}
  return false;
}

function shouldSuppressPlayback(appId: number): boolean {
  if (!state.settings.stop_on_launch) return false;
  if (runningApps.has(appId)) return true;
  if (recentLaunchAppId === appId && Date.now() < recentLaunchUntil) return true;
  return isAppRunningInStore(appId);
}

function haltPlayback() {
  ++activeSeq;
  stopAudio(0.4);
  setToast('off');
}

export function registerLaunchStop() {
  try {
    const sc = (window as any).SteamClient;
    if (!sc?.Apps?.RegisterForGameActionStart) {
      warn('RegisterForGameActionStart unavailable');
      return;
    }
    launchHook = sc.Apps.RegisterForGameActionStart((_actionType: unknown, strAppId?: unknown) => {
      recentLaunchAppId = parseLaunchAppId(strAppId);
      recentLaunchUntil = Date.now() + LAUNCH_SUPPRESS_MS;
      if (state.settings.stop_on_launch) haltPlayback();
    });
  } catch (e) {
    warn('failed to register launch listener', e);
  }
  try {
    const gs = (window as any).SteamClient?.GameSessions;
    if (gs?.RegisterForAppLifetimeNotifications) {
      lifetimeHook = gs.RegisterForAppLifetimeNotifications((n: any) => {
        const id = Number(n?.unAppID ?? n?.appid ?? 0);
        if (!Number.isFinite(id) || id <= 0) return;
        if (n?.bRunning) {
          runningApps.add(id);
          if (state.settings.stop_on_launch && currentAppId === id) haltPlayback();
        } else {
          runningApps.delete(id);
        }
      });
    }
  } catch (e) {
    warn('failed to register lifetime listener', e);
  }
}

export function unregisterLaunchStop() {
  launchHook?.unregister?.();
  lifetimeHook?.unregister?.();
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
