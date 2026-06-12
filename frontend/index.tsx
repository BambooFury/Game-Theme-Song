import { IconsModule, definePlugin, SliderField, callable, routerHook } from '@steambrew/client';
import React, { useEffect, useState } from 'react';

type Primitive = string | number | boolean;
type NoArgs = [];

const getThemeAudio = callable<[{ app_id: number | string; game_name: string; force_refresh: boolean }], string>('get_theme_audio');
const invalidateAudio = callable<[{ app_id: number | string }], string>('invalidate_audio');
const getBackendSettings = callable<NoArgs, string>('get_settings');
const setBackendSetting = callable<[{ key: string; value: Primitive }], string>('set_setting');
const getIconDataUri = callable<[{ name: string }], string>('get_icon_data_uri');
const logFrontend = callable<[{ message: string }], string>('log_frontend');

interface Settings {
  enabled: boolean;
  volume: number;
  fade_seconds: number;
  search_suffix: string;
}

const DEFAULTS: Settings = {
  enabled: true,
  volume: 0.35,
  fade_seconds: 1.5,
  search_suffix: ' theme song',
};

const WELCOME_FLAG = 'gts_welcomed_v1';

const state: { settings: Settings } = { settings: { ...DEFAULTS } };
const log = (...a: unknown[]) => console.log('[GameThemeSong]', ...a);
const warn = (...a: unknown[]) => console.warn('[GameThemeSong]', ...a);
const backendLog = (message: string) => {
  log(message);
  void logFrontend({ message }).catch(() => {});
};

let audioEl: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let activeSeq = 0;
let currentAppId: number | null = null;
let welcomePatch: any = null;
let welcomeInstalled = false;

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

interface ModalIcons {
  music: string;
  question: string;
  questionDark: string;
  exit: string;
  exitDark: string;
}

const modalIcons: ModalIcons = {
  music: '',
  question: '',
  questionDark: '',
  exit: '',
  exitDark: '',
};

async function loadModalIcons(): Promise<ModalIcons> {
  const entries: Array<[keyof ModalIcons, string]> = [['music', 'music-note.svg'],
    ['question', 'question.svg'],
    ['questionDark', 'question-dark.svg'],
    ['exit', 'exit.svg'],
    ['exitDark', 'exit-dark.svg']];
  await Promise.all(entries.map(async ([key, name]) => {
    if (modalIcons[key]) return;
    try {
      const raw = await getIconDataUri({ name });
      const resp = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (resp?.ok && resp.data_uri) modalIcons[key] = String(resp.data_uri);
    } catch (e) {
      warn('failed to load icon', name, e);
    }
  }));
  return modalIcons;
}

function ensureAudio(): HTMLAudioElement {
  if (audioEl && document.body.contains(audioEl)) return audioEl;
  const a = document.createElement('audio');
  a.id = 'game-theme-song-audio';
  a.preload = 'none';
  a.loop = true;
  a.style.display = 'none';
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

async function playUrl(url: string, mySeq: number, active: () => number): Promise<boolean> {
  if (mySeq !== active()) return false;
  const a = ensureAudio();
  a.onerror = () => {
    const err = a.error;
    backendLog(`audio element error: code=${err?.code ?? '?'} message=${err?.message ?? ''} networkState=${a.networkState} readyState=${a.readyState}`);
  };
  if (a.src !== url) {
    a.src = url;
    a.load();
  }
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
    backendLog(`autoplay blocked (${result}), retrying muted`);
    a.muted = true;
    result = await tryPlay();
    if (result === 'ok') {
      a.muted = false;
      backendLog('muted-start workaround succeeded');
    }
  }
  if (result !== 'ok') {
    backendLog(`audio play failed: ${result} (mediaError=${a.error?.code ?? 'none'})`);
    return false;
  }
  if (mySeq !== active()) {
    a.pause();
    return false;
  }
  backendLog('playback started');
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

function removeWelcomePatch() {
  if (!welcomePatch) return;
  try { routerHook.removePatch('/library', welcomePatch); } catch {}
  welcomePatch = null;
  welcomeInstalled = false;
}

function installWelcomePatch() {
  if (welcomeInstalled) return;
  welcomeInstalled = true;
  welcomePatch = routerHook.addPatch('/library', (props: any) => {
    const SP = (window as any).SP_REACT as typeof React;
    if (!SP) return props;
    return {
    ...props,
      children: SP.createElement(SP.Fragment, null, props.children, SP.createElement(WelcomeModal)),
    };
  });
}

function maybeShowWelcome() {
  try {
    if (localStorage.getItem(WELCOME_FLAG)) return;
  } catch {}
  backendLog('welcome modal: showing');
  installWelcomePatch();
}

const WelcomeModal: React.FC = () => {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<'intro' | 'info'>('intro');
  const [icons, setIcons] = useState<ModalIcons>({ ...modalIcons });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedIcons = await loadModalIcons();
        if (!cancelled) setIcons({ ...loadedIcons });
      } catch {}
      try {
        if (localStorage.getItem(WELCOME_FLAG)) {
          if (!cancelled) removeWelcomePatch();
          return;
        }
      } catch {}
      if (!cancelled) setShow(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const close = () => {
    try { localStorage.setItem(WELCOME_FLAG, '1'); } catch {}
    setShow(false);
    removeWelcomePatch();
  };
  const showInfo = () => setPhase('info');
  const backToIntro = () => setPhase('intro');
  const headerIcon = phase === 'info' ? icons.question : icons.music;
  const iconAlt = phase === 'info' ? 'Help' : 'Music';
  const buttonBaseStyle = { flex: 1, minHeight: 47, padding: '0 14px', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '18px' };
  const primaryButtonStyle = { ...buttonBaseStyle, background: '#67c1f5', color: '#111' };
  const secondaryButtonStyle = { ...buttonBaseStyle, background: '#2a2a2a', color: '#ddd' };
  const buttonLabel = (icon: string, text: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 18, lineHeight: '18px' }}>
      {icon && <img src={icon} alt="" style={{ width: 15, height: 15, display: 'block', objectFit: 'contain', flex: '0 0 15px' }} />}
      <span style={{ display: 'block', lineHeight: '18px' }}>{text}</span>
    </span>
  );
  const headerBg = phase === 'info' ? 'rgba(245,200,75,.13)' : 'rgba(103,193,245,.13)';
  const headerBorder = phase === 'info' ? '1px solid rgba(245,200,75,.34)' : '1px solid rgba(103,193,245,.3)';
  const headerShadow = phase === 'info' ? '0 0 32px rgba(245,200,75,.18)' : '0 0 32px rgba(103,193,245,.18)';

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999998, background: 'rgba(0,0,0,.82)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 999999, width: 460, background: '#101010', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, color: '#ddd', fontFamily: 'Arial,sans-serif', boxShadow: '0 22px 75px rgba(0,0,0,.72)', overflow: 'hidden' }}>
        <div style={{ padding: '28px 28px 12px', textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, margin: '0 auto 14px', borderRadius: '50%', background: headerBg, border: headerBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: headerShadow }}>
            {headerIcon ? (
              <img src={headerIcon} alt={iconAlt} style={{ width: 32, height: 32, display: 'block', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#67c1f5' }} />
            )}
          </div>
          <h2 style={{ margin: '0 0 8px', color: '#fff', fontSize: 22, lineHeight: 1.2 }}>
            {phase === 'info' ? 'How It Works' : 'Game Theme Song'}
          </h2>
          <div style={{ fontSize: 12, color: '#8d8d8d', textTransform: 'uppercase', letterSpacing: .5 }}>
            {phase === 'intro' && 'ready to play'}
            {phase === 'info' && 'quick guide'}
          </div>
        </div>
        <div style={{ padding: '10px 28px 8px', fontSize: 14, lineHeight: 1.55, color: '#c7c7c7' }}>
          {phase === 'intro' && (
            <div>
              Game Theme Song plays each game's theme music in the background when you open its page in your Steam Library. No setup needed — everything works out of the box.
              <div style={{ marginTop: 10, color: '#969696', fontSize: 13 }}>You can adjust the music volume anytime in the plugin settings.</div>
            </div>
          )}
          {phase === 'info' && (
            <div>
              Open a game in your Steam Library and the plugin will search for a matching theme song, then play it in the background. The first play for a game can take a few seconds because the plugin has to find a fresh audio link.
              <div style={{ marginTop: 10 }}>After that, the result is cached for a while, so returning to the same game starts much faster.</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '24px 28px 28px' }}>
          {phase === 'intro' && (
            <>
              <button onClick={showInfo} style={secondaryButtonStyle}>{buttonLabel(icons.question, 'How It Works')}</button>
              <button onClick={close} style={primaryButtonStyle}>{buttonLabel(icons.exitDark, 'Got It')}</button>
            </>
          )}
          {phase === 'info' && (
            <>
              <button onClick={backToIntro} style={secondaryButtonStyle}>Back</button>
              <button onClick={close} style={primaryButtonStyle}>{buttonLabel(icons.exitDark, 'Got It')}</button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

async function playForApp(appId: number) {
  try {
    if (!state.settings.enabled) return;
    if (currentAppId === appId && audioEl && !audioEl.paused) return;
    currentAppId = appId;
    const mySeq = ++activeSeq;
    const getSeq = () => activeSeq;
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

    backendLog(`backend response ${JSON.stringify(resp)}`);
    if (mySeq !== activeSeq) return;
    if (!resp?.ok || !resp.url) {
      warn('no audio for', name, resp?.error);
      return;
    }

    backendLog(`playing ${name} ${resp.title ?? ''}`);
    const ok = await playUrl(resp.url, mySeq, getSeq);
    if (ok || mySeq !== activeSeq) return;

    await invalidateAudio({ app_id: appId });
    const raw2 = await getThemeAudio({ app_id: appId, game_name: name, force_refresh: true });
    const r2 = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
    if (mySeq !== activeSeq || !r2?.ok) return;

    if (r2.url) await playUrl(r2.url, mySeq, getSeq);
  } catch (e) {
    warn('playForApp crashed', e);
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
  backendLog(`detected app id ${id ?? 'none'}`);

  if (id !== currentAppId) {
    stopAudio();
    ++activeSeq;
  }
  if (navDebounceTimer) clearTimeout(navDebounceTimer);
  navDebounceTimer = setTimeout(() => {
    navDebounceTimer = null;
    const finalId = detectAppId();
    if (finalId === currentAppId) return;
    if (finalId === null) currentAppId = null;
    else void playForApp(finalId);
  }, NAV_DEBOUNCE_MS);
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, POLL_MS);
  setTimeout(pollOnce, 100);
}

const SettingsContent: React.FC = () => {
  const [percent, setPercent] = useState(Math.round(state.settings.volume * 100));
  useEffect(() => {
    (async () => {
      try {
        const raw = await getBackendSettings();
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (s && typeof s === 'object') {
          state.settings = { ...state.settings, ...s };
          setPercent(Math.round(state.settings.volume * 100));
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
  return (
    <SliderField
      label="Music volume"
      description={`Background theme music is set to ${percent}%.`}
      min={0}
      max={100}
      step={1}
      value={percent}
      showValue
      valueSuffix="%"
      notchCount={5}
      notchLabels={[{ notchIndex: 0, label: '0%', value: 0 },
        { notchIndex: 1, label: '25%', value: 25 },
        { notchIndex: 2, label: '50%', value: 50 },
        { notchIndex: 3, label: '75%', value: 75 },
        { notchIndex: 4, label: '100%', value: 100 }]}
      notchTicksVisible
      onChange={onSlider}
    />
  );
};

export default definePlugin(() => {
  backendLog('frontend mounted');
  void loadSettingsOnce();
  setTimeout(() => maybeShowWelcome(), 1500);
  startPolling();
  return {
    title: 'Game Theme Song',
    icon: <IconsModule.Music />,
    content: <SettingsContent />,
    onDismount() {
      removeWelcomePatch();
    },
  };
});
