import { IconsModule, definePlugin, callable, routerHook } from '@steambrew/client';
import React, { useEffect, useState } from 'react';
import { SEARCH_TOAST_CSS, SEARCH_TOAST_ICON, SETTINGS_CSS, SETTINGS_ICONS } from './_assets.generated';

type Primitive = string | number | boolean;
type NoArgs = [];

const getThemeAudio = callable<[{ app_id: number | string; game_name: string; force_refresh: boolean }], string>('get_theme_audio');
const invalidateAudio = callable<[{ app_id: number | string }], string>('invalidate_audio');
const getBackendSettings = callable<NoArgs, string>('get_settings');
const setBackendSetting = callable<[{ key: string; value: Primitive }], string>('set_setting');
const logFrontend = callable<[{ message: string }], string>('log_frontend');

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
    for (const value of [window.location.href, document.location?.href, document.body?.innerHTML?.match(/\/library\/app\/\d+/)?.[0]]) {
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

interface ToggleRowProps {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ icon, title, description, checked, onChange }) => (
  <div className={`gts-set-row${checked ? ' gts-on' : ''}`} onClick={() => onChange(!checked)}>
    <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
    <span className="gts-set-text">
      <div className="gts-set-title">{title}</div>
      <div className="gts-set-desc">{description}</div>
    </span>
    <span className="gts-set-switch"><span className="gts-set-knob" /></span>
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
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ icon, title, description, value, valueLabel, min = 0, max = 100, step = 1, onChange }) => {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={`gts-set-row gts-vert${value > min ? ' gts-on' : ''}`}>
      <div className="gts-set-head">
        <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="gts-set-text">
          <div className="gts-set-title">{title}</div>
          <div className="gts-set-desc">{description}</div>
        </span>
        <span className="gts-set-val">{valueLabel}</span>
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

const SettingsContent: React.FC = () => {
  const [percent, setPercent] = useState(Math.round(state.settings.volume * 100));
  const [loop, setLoop] = useState(state.settings.loop);
  const [maxSec, setMaxSec] = useState(state.settings.max_seconds);
  const [stopOnLaunch, setStopOnLaunch] = useState(state.settings.stop_on_launch);
  useEffect(() => {
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
  const onStopOnLaunch = (checked: boolean) => {
    setStopOnLaunch(checked);
    state.settings.stop_on_launch = checked;
    void setBackendSetting({ key: 'stop_on_launch', value: checked }).catch(e => warn('save stop_on_launch failed', e));
  };
  return (
    <>
    <style>{SETTINGS_CSS}</style>
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
      step={15}
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
    </>
  );
};

export default definePlugin(() => {
  void loadSettingsOnce();
  routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
  startPolling();
  registerLaunchStop();
  return {
    title: 'Game Theme Song',
    icon: <IconsModule.Music />,
    content: <SettingsContent />,
    onDismount() {
      routerHook.removeGlobalComponent('GTSSearchToast');
      launchHook?.unregister?.();
    },
  };
});