import { IconsModule, definePlugin, callable, routerHook } from '@steambrew/client';
import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { SEARCH_TOAST_CSS, SEARCH_TOAST_ICON, SETTINGS_CSS, SETTINGS_ICONS } from './_assets.generated';

type Primitive = string | number | boolean;
type NoArgs = [];

const getThemeAudio = callable<[{ app_id: number | string; game_name: string; force_refresh: boolean }], string>('get_theme_audio');
const invalidateAudio = callable<[{ app_id: number | string }], string>('invalidate_audio');
const getBackendSettings = callable<NoArgs, string>('get_settings');
const setBackendSetting = callable<[{ key: string; value: Primitive }], string>('set_setting');
const logFrontend = callable<[{ message: string }], string>('log_frontend');
const getCacheInfo = callable<NoArgs, string>('get_cache_info');
const clearAudioCache = callable<NoArgs, string>('clear_audio_cache');
const getCustomList = callable<NoArgs, string>('get_custom_list');
const setCustomMusicBegin = callable<[{ app_id: number | string }], string>('set_custom_music_begin');
const setCustomMusicChunk = callable<[{ app_id: number | string; chunk: string }], string>('set_custom_music_chunk');
const setCustomMusicFinish = callable<[{ app_id: number | string; ext: string; title_b64: string; name_b64: string }], string>('set_custom_music_finish');
const clearCustomMusic = callable<[{ app_id: number | string }], string>('clear_custom_music');

interface Settings {
  enabled: boolean;
  volume: number;
  fade_seconds: number;
  search_suffix: string;
  loop: boolean;
  max_seconds: number;
  stop_on_launch: boolean;
}

const DEFAULTS: Settings = {
  enabled: true,
  volume: 0.35,
  fade_seconds: 1.5,
  search_suffix: ' theme song',
  loop: true,
  max_seconds: 0,
  stop_on_launch: true,
};

const state: { settings: Settings } = { settings: { ...DEFAULTS } };
const warn = (...a: unknown[]) => console.warn('[GameThemeSong]', ...a);
const reportError = (message: string) => {
  warn(message);
  void logFrontend({ message }).catch(() => {});
};

let audioEl: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let activeSeq = 0;
let currentAppId: number | null = null;

async function loadSettingsOnce() {
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

function stopAudio(durationSec = state.settings.fade_seconds) {
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
  a.onerror = () => {
    const err = a.error;
    reportError(`audio element error: code=${err?.code ?? '?'} message=${err?.message ?? ''} networkState=${a.networkState} readyState=${a.readyState}`);
  };
  if (a.src !== url) {
    a.src = url;
    a.load();
  }
  a.loop = state.settings.loop;
  a.volume = 0;
  a.muted = false;
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

let searchActive = false;
let searchListeners: ((on: boolean) => void)[] = [];

function setSearching(on: boolean) {
  if (searchActive === on) return;
  searchActive = on;
  for (const fn of searchListeners) fn(on);
}

let libWindowOpen = false;
let libWindowListeners: ((open: boolean) => void)[] = [];

function setLibWindowOpen(open: boolean) {
  if (libWindowOpen === open) return;
  libWindowOpen = open;
  for (const fn of libWindowListeners) fn(open);
}

let gCustomCount: number | null = null;
let gCustomCountListeners: ((n: number | null) => void)[] = [];

function setGlobalCustomCount(n: number | null) {
  gCustomCount = n;
  for (const fn of gCustomCountListeners) fn(n);
}

const SearchToast: React.FC = () => {
  const [on, setOn] = useState(searchActive);

  useEffect(() => {
    const fn = (v: boolean) => setOn(v);
    searchListeners.push(fn);
    return () => { searchListeners = searchListeners.filter((x) => x !== fn); };
  }, []);

  return (
    <>
      <style>{SEARCH_TOAST_CSS}</style>
      <div id="gts-search-toast" className={on ? 'gts-show' : ''}>
        <span className="gts-search-toast-icon" dangerouslySetInnerHTML={{ __html: SEARCH_TOAST_ICON }} />
        <span>Searching music&hellip;</span>
      </div>
    </>
  );
};

async function playForApp(appId: number) {
  let mySeq = -1;
  try {
    if (!state.settings.enabled) return;
    if (currentAppId === appId && audioEl && !audioEl.paused) return;
    currentAppId = appId;
    mySeq = ++activeSeq;
    const getSeq = () => activeSeq;
    setSearching(true);
    const name = await resolveGameName(appId);
    if (mySeq !== activeSeq) return;
    if (!name) { warn('no name for', appId); return; }

    let resp: any;
    try {
      const raw = await getThemeAudio({ app_id: appId, game_name: name, force_refresh: false });
      resp = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      warn('backend error', e);
      return;
    }

    if (mySeq !== activeSeq) return;
    if (!resp?.ok || !resp.url) {
      warn('no audio for', name, resp?.error);
      return;
    }

    const ok = await playUrl(resp.url, mySeq, getSeq);
    if (ok || mySeq !== activeSeq) return;

    await invalidateAudio({ app_id: appId });
    const raw2 = await getThemeAudio({ app_id: appId, game_name: name, force_refresh: true });
    const r2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
    if (mySeq !== activeSeq || !r2?.ok) return;

    if (r2.url) await playUrl(r2.url, mySeq, getSeq);
  } catch (e) {
    warn('playForApp crashed', e);
  } finally {
    if (mySeq === activeSeq) setSearching(false);
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
    if (finalId === null) { currentAppId = null; setSearching(false); }
    else void playForApp(finalId);
  }, NAV_DEBOUNCE_MS);
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, POLL_MS);
  setTimeout(pollOnce, 100);
}

let launchHook: { unregister?: () => void } | null = null;

function registerLaunchStop() {
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

async function reapplyForApp(appId: number) {
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

interface ToggleRowProps {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ icon, title, description, checked, onChange }) => (
  <div className={`gts-set-row${checked ? ' gts-on' : ''}`}>
    <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
    <span className="gts-set-text">
      <div className="gts-set-title">{title}</div>
      <div className="gts-set-desc">{description}</div>
    </span>
    <span className="gts-set-switch" onClick={() => onChange(!checked)}><span className="gts-set-knob" /></span>
  </div>
);

interface ButtonRowProps {
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  disabled?: boolean;
  onClick: () => void;
}

const ButtonRow: React.FC<ButtonRowProps> = ({ icon, title, description, buttonLabel, disabled, onClick }) => (
  <div className="gts-set-row">
    <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
    <span className="gts-set-text">
      <div className="gts-set-title">{title}</div>
      <div className="gts-set-desc">{description}</div>
    </span>
    <button className="gts-set-btn" disabled={disabled} onClick={onClick}>{buttonLabel}</button>
  </div>
);

interface SliderRowProps {
  icon: string;
  title: string;
  description: string;
  value: number;
  valueLabel: string;
  min?: number;
  max?: number;
  step?: number;
  editable?: boolean;
  inputSuffix?: string;
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ icon, title, description, value, valueLabel, min = 0, max = 100, step = 1, editable = false, inputSuffix = '', onChange }) => {
  const fill = ((value - min) / (max - min)) * 100;
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) { setText(String(value)); return; }
    const clamped = Math.max(min, Math.min(max, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className={`gts-set-row gts-vert${value > min ? ' gts-on' : ''}`}>
      <div className="gts-set-head">
        <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="gts-set-text">
          <div className="gts-set-title">{title}</div>
          <div className="gts-set-desc">{description}</div>
        </span>
        {editable ? (
          <span className="gts-set-val gts-set-val-edit">
            <input
              type="number"
              className="gts-set-num"
              min={min}
              max={max}
              step={step}
              value={text}
              onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setText(ev.target.value)}
              onBlur={(ev: React.FocusEvent<HTMLInputElement>) => commit(ev.target.value)}
              onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
            />
            {inputSuffix ? <span className="gts-set-num-suffix">{inputSuffix}</span> : null}
          </span>
        ) : (
          <span className="gts-set-val">{valueLabel}</span>
        )}
      </div>
      <input
        type="range"
        className="gts-set-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ background: `linear-gradient(to right, #67c1f5 ${fill}%, rgba(255,255,255,0.12) ${fill}%)` }}
        onChange={(ev: React.ChangeEvent<HTMLInputElement>) => onChange(Number(ev.target.value))}
      />
    </div>
  );
};

const formatLimit = (sec: number) => {
  if (sec <= 0) return 'Off';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
};

interface LibApp {
  appid: number;
  name: string;
}
type CustomMap = Record<string, { title?: string; name?: string }>;

function decodeCustomItems(items: Record<string, { title_b64?: string; name_b64?: string }>): CustomMap {
  const out: CustomMap = {};
  for (const k in items) {
    const it = items[k] || {};
    out[k] = { title: base64ToUtf8(it.title_b64 ?? ''), name: base64ToUtf8(it.name_b64 ?? '') };
  }
  return out;
}

const ACCEPT_EXTS = '.mp3,.m4a,.aac,.ogg,.oga,.opus,.webm,.wav,.flac,audio/*';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_CARDS = 200;

function getLibraryApps(): LibApp[] {
  const out: LibApp[] = [];
  const seen = new Set<number>();
  const push = (ov: any) => {
    if (!ov) return;
    const appid = Number(ov.appid ?? ov.m_unAppID ?? ov.nAppID ?? ov.unAppID);
    if (!appid || Number.isNaN(appid) || seen.has(appid)) return;
    const name = ov.display_name ?? ov.appname ?? ov.strDisplayName ?? ov.name ?? `App ${appid}`;
    seen.add(appid);
    out.push({ appid, name: String(name) });
  };
  try {
    const cs: any = (window as any).collectionStore;
    const cols = [cs?.allGamesCollection, cs?.GetCollection?.('all-games'), cs?.GetCollection?.('local-install')];
    for (const col of cols) {
      const apps = col?.allApps ?? col?.visibleApps;
      if (apps && typeof apps[Symbol.iterator] === 'function') for (const a of apps) push(a);
    }
  } catch (e) { warn('collectionStore read failed', e); }
  if (out.length === 0) {
    try {
      const m: any = (window as any).appStore?.m_mapApps;
      if (m && typeof m.values === 'function') for (const ov of m.values()) push(ov);
    } catch (e) { warn('appStore read failed', e); }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function coverCandidates(appid: number): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
  ];
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(arrayBufferToBase64(fr.result as ArrayBuffer));
    fr.onerror = () => reject(fr.error ?? new Error('read_failed'));
    fr.readAsArrayBuffer(file);
  });
}

const UPLOAD_CHUNK = 128 * 1024;

function utf8ToBase64(s: string): string {
  const bytes = encodeURIComponent(s).replace(/%([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  return btoa(bytes);
}

function base64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64);
    let pct = '';
    for (let i = 0; i < bin.length; i++) pct += '%' + ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
    return decodeURIComponent(pct);
  } catch {
    return '';
  }
}

async function uploadCustomMusic(appid: number | string, gameName: string, fileName: string, data: string): Promise<{ ok: boolean; error?: string }> {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const begin = JSON.parse(await setCustomMusicBegin({ app_id: appid }));
  if (!begin?.ok) return begin;
  for (let i = 0; i < data.length; i += UPLOAD_CHUNK) {
    const r = JSON.parse(await setCustomMusicChunk({ app_id: appid, chunk: data.slice(i, i + UPLOAD_CHUNK) }));
    if (!r?.ok) return r;
  }
  return JSON.parse(await setCustomMusicFinish({ app_id: appid, ext, title_b64: utf8ToBase64(fileName), name_b64: utf8ToBase64(gameName) }));
}

interface GameCardProps {
  key?: React.Key;
  app: LibApp;
  customTitle?: string;
  busy: boolean;
  onSet: (app: LibApp) => void;
  onClear: (app: LibApp) => void;
}

const GameCard = memo(function GameCard({ app, customTitle, busy, onSet, onClear }: GameCardProps) {
  const urls = useMemo(() => coverCandidates(app.appid), [app.appid]);
  const [idx, setIdx] = useState(0);
  const failed = idx >= urls.length;
  const hasCustom = customTitle !== undefined;
  return (
    <div className={`gts-lib-card${hasCustom ? ' gts-has-custom' : ''}`}>
      <div className="gts-lib-cover-wrap">
        {failed
          ? <div className="gts-lib-fallback">{app.name}</div>
          : <img className="gts-lib-cover" src={urls[idx]} alt="" loading="lazy" decoding="async" onError={() => setIdx((i) => i + 1)} />}
        {hasCustom && <span className="gts-lib-badge">♪ Custom</span>}
      </div>
      <div className="gts-lib-card-body">
        <div className="gts-lib-card-name">{app.name}</div>
        <div className="gts-lib-card-actions">
          <button className="gts-lib-mini gts-primary" disabled={busy} onClick={() => onSet(app)}>
            {busy ? 'Saving…' : hasCustom ? 'Replace' : 'Set music'}
          </button>
          {hasCustom && <button className="gts-lib-mini gts-danger" disabled={busy} onClick={() => onClear(app)} dangerouslySetInnerHTML={{ __html: SETTINGS_ICONS.trash }} />}
        </div>
      </div>
    </div>
  );
});

interface LibraryModalProps {
  onClose: () => void;
  onChanged: (map: CustomMap) => void;
}

const LibraryModal: React.FC<LibraryModalProps> = ({ onClose, onChanged }) => {
  const [apps, setApps] = useState<LibApp[] | null>(null);
  const [customMap, setCustomMap] = useState<CustomMap>({});
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingApp = useRef<LibApp | null>(null);

  useEffect(() => {
    setApps(getLibraryApps());
    (async () => {
      try {
        const raw = await getCustomList();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (info?.ok && info.items) setCustomMap(decodeCustomItems(info.items));
      } catch (e) { warn('getCustomList failed', e); }
    })();
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const customMapRef = useRef(customMap);
  customMapRef.current = customMap;

  const commit = (map: CustomMap) => { setCustomMap(map); onChanged(map); };

  const onSet = useCallback((app: LibApp) => {
    setError(null);
    pendingApp.current = app;
    fileRef.current?.click();
  }, []);

  const onFilePicked = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    const app = pendingApp.current;
    pendingApp.current = null;
    if (!file || !app) return;
    if (file.size > MAX_UPLOAD_BYTES) { setError(`"${file.name}" is too large (max 50 MB).`); return; }
    setBusyId(app.appid);
    setError(null);
    try {
      const data = await readFileBase64(file);
      const resp = await uploadCustomMusic(app.appid, app.name, file.name, data);
      if (!resp?.ok) { setError(`Couldn't set music: ${resp?.error ?? 'unknown error'}.`); return; }
      commit({ ...customMap, [String(app.appid)]: { title: file.name.replace(/\.[^.]+$/, ''), name: app.name } });
      void reapplyForApp(app.appid);
    } catch (e) {
      warn('set custom failed', e);
      const detail = e instanceof Error && e.message ? `: ${e.message}` : '';
      setError(`Something went wrong while saving the file${detail}.`);
    } finally {
      setBusyId(null);
    }
  };

  const onClear = useCallback(async (app: LibApp) => {
    setBusyId(app.appid);
    setError(null);
    try {
      await clearCustomMusic({ app_id: app.appid });
      const next = { ...customMapRef.current };
      delete next[String(app.appid)];
      setCustomMap(next);
      onChanged(next);
      void reapplyForApp(app.appid);
    } catch (e) {
      warn('clear custom failed', e);
      setError('Could not remove the custom track.');
    } finally {
      setBusyId(null);
    }
  }, [onChanged]);

  const visible = useMemo(() => {
    if (!apps) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps;
    return [...filtered].sort((a, b) => {
      const ca = customMap[String(a.appid)] ? 0 : 1;
      const cb = customMap[String(b.appid)] ? 0 : 1;
      return ca - cb || a.name.localeCompare(b.name);
    });
  }, [apps, query, customMap]);

  const customCount = Object.keys(customMap).length;
  const shown = visible.slice(0, MAX_CARDS);

  const tree = (
    <>
      <style>{SETTINGS_CSS}</style>
      <div className="gts-lib-dim" onMouseDown={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="gts-lib-dlg" role="dialog" aria-modal="true">
          <div className="gts-lib-head">
            <span className="gts-lib-head-ic" dangerouslySetInnerHTML={{ __html: SETTINGS_ICONS.library }} />
            <span className="gts-lib-head-text">
              <div className="gts-lib-title">Custom game music</div>
              <div className="gts-lib-sub">
                {customCount > 0 ? `${customCount} ${customCount === 1 ? 'game uses' : 'games use'} your own track` : 'Pick your own theme for any game — it always plays before the auto search.'}
              </div>
            </span>
            <button className="gts-lib-x" aria-label="Close" onClick={onClose}>✕</button>
          </div>

          <div className="gts-lib-search">
            <input type="text" placeholder="Search your library…" value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} />
          </div>

          {error && <div className="gts-lib-foot" style={{ color: '#ff8585' }}>{error}</div>}

          <div className="gts-lib-grid">
            {apps === null && <div className="gts-lib-loading">Loading your library…</div>}
            {apps !== null && shown.length === 0 && <div className="gts-lib-empty">No games match “{query}”.</div>}
            {shown.map((app) => (
              <GameCard
                key={app.appid}
                app={app}
                customTitle={customMap[String(app.appid)]?.title}
                busy={busyId === app.appid}
                onSet={onSet}
                onClear={onClear}
              />
            ))}
          </div>

          <div className="gts-lib-foot">
            {visible.length > MAX_CARDS
              ? <>Showing first <b>{MAX_CARDS}</b> of {visible.length} — use search to narrow down.</>
              : <>Supported formats: <b>MP3, M4A, AAC, OGG, OPUS, WAV, FLAC</b> — up to <b>50 MB</b> per file.</>}
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT_EXTS} style={{ display: 'none' }} onChange={onFilePicked} />
    </>
  );

  return tree;
};

const LibraryWindow: React.FC = () => {
  const [open, setOpen] = useState(libWindowOpen);

  useEffect(() => {
    const fn = (v: boolean) => setOpen(v);
    libWindowListeners.push(fn);
    return () => { libWindowListeners = libWindowListeners.filter((x) => x !== fn); };
  }, []);

  if (!open) return null;

  return (
    <LibraryModal
      onClose={() => setLibWindowOpen(false)}
      onChanged={(map) => setGlobalCustomCount(Object.keys(map).length)}
    />
  );
};

const SettingsContent: React.FC = () => {
  const [percent, setPercent] = useState(Math.round(state.settings.volume * 100));
  const [loop, setLoop] = useState(state.settings.loop);
  const [maxSec, setMaxSec] = useState(state.settings.max_seconds);
  const [stopOnLaunch, setStopOnLaunch] = useState(state.settings.stop_on_launch);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [customCount, setCustomCount] = useState<number | null>(gCustomCount);
  useEffect(() => {
    const fn = (n: number | null) => setCustomCount(n);
    gCustomCountListeners.push(fn);
    return () => { gCustomCountListeners = gCustomCountListeners.filter((x) => x !== fn); };
  }, []);
  const refreshCustomCount = async () => {
    try {
      const raw = await getCustomList();
      const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (info?.ok) setGlobalCustomCount(Object.keys(info.items ?? {}).length);
    } catch (e) {
      warn('failed to load custom list', e);
    }
  };
  const refreshCacheInfo = async () => {
    try {
      const raw = await getCacheInfo();
      const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (info?.ok) {
        setCacheCount(info.count ?? 0);
        setCacheBytes(info.bytes ?? 0);
      }
    } catch (e) {
      warn('failed to load cache info', e);
    }
  };
  useEffect(() => {
    void refreshCacheInfo();
    void refreshCustomCount();
    (async () => {
      try {
        const raw = await getBackendSettings();
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (s && typeof s === 'object') {
          state.settings = { ...state.settings, ...s };
          setPercent(Math.round(state.settings.volume * 100));
          setLoop(state.settings.loop);
          setMaxSec(state.settings.max_seconds);
          setStopOnLaunch(state.settings.stop_on_launch);
          if (audioEl) audioEl.volume = state.settings.volume;
        }
      } catch (e) {
        warn('failed to load settings', e);
      }
    })();
  }, []);
  const onSlider = (p: number) => {
    const vol = Math.max(0, Math.min(1, Math.round(p) / 100));
    setPercent(Math.round(vol * 100));
    state.settings.volume = vol;
    void setBackendSetting({ key: 'volume', value: vol }).catch(e => warn('save volume failed', e));
    if (audioEl && !audioEl.paused) audioEl.volume = vol;
  };
  const onLoop = (checked: boolean) => {
    setLoop(checked);
    state.settings.loop = checked;
    void setBackendSetting({ key: 'loop', value: checked }).catch(e => warn('save loop failed', e));
    if (audioEl) audioEl.loop = checked;
  };
  const onLimit = (sec: number) => {
    const v = Math.max(0, Math.round(sec));
    setMaxSec(v);
    state.settings.max_seconds = v;
    void setBackendSetting({ key: 'max_seconds', value: v }).catch(e => warn('save max_seconds failed', e));
  };
  const onClearCache = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearAudioCache();
      stopAudio(0);
      currentAppId = null;
      lastDetectedAppId = null;
      await refreshCacheInfo();
    } catch (e) {
      warn('clear cache failed', e);
    } finally {
      setClearing(false);
    }
  };
  const onStopOnLaunch = (checked: boolean) => {
    setStopOnLaunch(checked);
    state.settings.stop_on_launch = checked;
    void setBackendSetting({ key: 'stop_on_launch', value: checked }).catch(e => warn('save stop_on_launch failed', e));
  };
  return (
    <>
    <style>{SETTINGS_CSS}</style>
    <ButtonRow
      icon={SETTINGS_ICONS.library}
      title="Custom game music"
      description={customCount === null
        ? 'Choose your own theme for any game in your library.'
        : customCount === 0
          ? 'Pick your own theme for any game — it plays before the auto search.'
          : `${customCount} ${customCount === 1 ? 'game uses' : 'games use'} your own track · plays first.`}
      buttonLabel="Open"
      onClick={() => setLibWindowOpen(true)}
    />
    <SliderRow
      icon={SETTINGS_ICONS.volume}
      title="Music volume"
      description={percent > 0 ? 'Background theme music volume.' : 'Theme music is muted.'}
      value={percent}
      valueLabel={`${percent}%`}
      onChange={onSlider}
    />
    <SliderRow
      icon={SETTINGS_ICONS.timer}
      title="Song length limit"
      description={maxSec > 0
        ? (loop ? `The song restarts after ${formatLimit(maxSec)}.` : `The song stops after ${formatLimit(maxSec)}.`)
        : 'The full song plays.'}
      value={maxSec}
      valueLabel={formatLimit(maxSec)}
      min={0}
      max={300}
      step={5}
      editable
      inputSuffix="s"
      onChange={onLimit}
    />
    <ToggleRow
      icon={SETTINGS_ICONS.repeat}
      title="Loop song"
      description={loop ? 'The theme song repeats while you stay on the game page.' : 'The theme song plays once and stops.'}
      checked={loop}
      onChange={onLoop}
    />
    <ToggleRow
      icon={SETTINGS_ICONS.gamepad}
      title="Stop on game launch"
      description={stopOnLaunch ? 'Theme music stops when you launch a game.' : 'Theme music keeps playing when a game starts.'}
      checked={stopOnLaunch}
      onChange={onStopOnLaunch}
    />
    <ButtonRow
      icon={SETTINGS_ICONS.trash}
      title="Clear downloaded music"
      description={cacheCount === null ? 'Checking…' : cacheCount === 0 ? 'Nothing downloaded yet.' : `${cacheCount} ${cacheCount === 1 ? 'track' : 'tracks'} · ${(cacheBytes / 1048576).toFixed(1)} MB on disk`}
      buttonLabel={clearing ? 'Clearing…' : 'Clear'}
      disabled={clearing || cacheCount === 0}
      onClick={() => { void onClearCache(); }}
    />
    </>
  );
};

export default definePlugin(() => {
  void loadSettingsOnce();
  routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
  routerHook.addGlobalComponent('GTSLibraryWindow', LibraryWindow);
  startPolling();
  registerLaunchStop();
  return {
    title: 'Game Theme Song',
    icon: <IconsModule.Music />,
    content: <SettingsContent />,
    onDismount() {
      routerHook.removeGlobalComponent('GTSSearchToast');
      routerHook.removeGlobalComponent('GTSLibraryWindow');
      launchHook?.unregister?.();
    },
  };
});