import { IconsModule, definePlugin, SliderField, callable, routerHook } from '@steambrew/client';
import React, { useEffect, useRef, useState } from 'react';

type Primitive = string | number | boolean;
type NoArgs = [];

const getThemeAudio = callable<[{ app_id: number | string; game_name: string; force_refresh: boolean }], string>('get_theme_audio');
const invalidateAudio = callable<[{ app_id: number | string }], string>('invalidate_audio');
const getBackendSettings = callable<NoArgs, string>('get_settings');
const setBackendSetting = callable<[{ key: string; value: Primitive }], string>('set_setting');
const welcomeGetState = callable<NoArgs, string>('welcome_get_state');
const getIconDataUri = callable<[{ name: string }], string>('get_icon_data_uri');
const ytdlpHiddenDownloadStart = callable<NoArgs, string>('ytdlp_hidden_download_start');
const ytdlpHiddenDownloadStatus = callable<NoArgs, string>('ytdlp_hidden_download_status');
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

const state: { settings: Settings } = { settings: {...DEFAULTS } };
const log = (...a: unknown[]) => console.log('[GameThemeSong]',...a);
const warn = (...a: unknown[]) => console.warn('[GameThemeSong]',...a);
const backendLog = (message: string) => {
  log(message);
  void logFrontend({ message }).catch(() => {});
};

let audioEl: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let activeSeq = 0;
let currentAppId: number | null = null;
let setupPatch: any = null;
let setupInstalled = false;

async function loadSettingsOnce() {
  try {
    const raw = await getBackendSettings();
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (s && typeof s === 'object') {
      state.settings = {...state.settings,...s };
      if (audioEl) audioEl.volume = state.settings.volume;
    }
  } catch (e) {
    warn('failed to load settings on start', e);
  }
}

interface ModalIcons {
  check: string;
  music: string;
  musicDark: string;
  question: string;
  questionDark: string;
  exit: string;
  exitDark: string;
}

const modalIcons: ModalIcons = {
  check: '',
  music: '',
  musicDark: '',
  question: '',
  questionDark: '',
  exit: '',
  exitDark: '',
};

async function loadModalIcons(): Promise<ModalIcons> {
  const entries: Array<[keyof ModalIcons, string]> = [['check', 'check.svg'],
    ['music', 'music-note.svg'],
    ['musicDark', 'music-note-dark.svg'],
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
  if (a.src !== url) {
    a.src = url;
    a.load();
  }
  a.volume = 0;
  return new Promise((resolve) => {
    a.onerror = () => {
      warn('audio error', a.error?.code);
      resolve(false);
    };
    a.play()
    .then(() => {
        if (mySeq !== active()) { resolve(false); return; }
        fadeTo(state.settings.volume, state.settings.fade_seconds);
        resolve(true);
      })
    .catch((e) => {
        warn('audio play rejected', e?.message ?? e);
        resolve(false);
      });
  });
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

async function downloadYtdlp(onProgress: (p: number) => void) {
  const globalState = window as any;
  if (globalState.__gts_ytdlp_installing) {
    backendLog('hidden yt-dlp download: already running');
    return globalState.__gts_ytdlp_installing;
  }
  globalState.__gts_ytdlp_installing = (async () => {
    backendLog('hidden yt-dlp download: begin');
    const startRaw = await ytdlpHiddenDownloadStart();
    const start = typeof startRaw === 'string' ? JSON.parse(startRaw) : startRaw;
    if (!start?.ok) throw new Error(start?.error ?? 'hidden_download_start_failed');

    let visualProgress = 8;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180000) {
      await new Promise(r => setTimeout(r, 700));
      const raw = await ytdlpHiddenDownloadStatus();
      const status = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (status?.state === 'done') {
        onProgress(100);
        backendLog(`hidden yt-dlp download: done ${status.size ?? 0}`);
        return;
      }
      if (status?.state === 'error') throw new Error(status.error ?? 'hidden_download_failed');
      visualProgress = Math.min(95, visualProgress + 2);
      if (typeof status?.size === 'number' && status.size > 0) {
        const bySize = Math.round((status.size / (22 * 1024 * 1024)) * 100);
        visualProgress = Math.max(visualProgress, Math.min(95, bySize));
      }
      onProgress(visualProgress);
    }
    throw new Error('hidden_download_timeout');
  })().finally(() => {
    globalState.__gts_ytdlp_installing = null;
  });
  return globalState.__gts_ytdlp_installing;
}

function removeSetupPatch() {
  if (!setupPatch) return;
  try { routerHook.removePatch('/library', setupPatch); } catch {}
  setupPatch = null;
  setupInstalled = false;
}

function installSetupPatch() {
  if (setupInstalled) return;
  setupInstalled = true;
  setupPatch = routerHook.addPatch('/library', (props: any) => {
    const SP = (window as any).SP_REACT as typeof React;
    if (!SP) return props;
    return {
    ...props,
      children: SP.createElement(SP.Fragment, null, props.children, SP.createElement(SetupModal)),
    };
  });
}

function showSetupModal() {
  if ((window as any).__gts_setup_later) return;
  backendLog('setup modal: showing');
  installSetupPatch();
  (window as any).__gts_force_setup = true;
}

async function maybeShowSetup() {
  backendLog('setup check: start');
  try {
    const raw = await welcomeGetState();
    backendLog(`setup check: raw ${String(raw).slice(0, 200)}`);
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    backendLog(`setup check: ytdlp_present=${String(s?.ytdlp_present)} size=${String(s?.ytdlp_size)}`);
    if (!s?.ytdlp_present && !(window as any).__gts_setup_later) showSetupModal();
  } catch (e) {
    backendLog(`setup check failed: ${String((e as any)?.message ?? e)}`);
    showSetupModal();
  }
}

const SetupModal: React.FC = () => {
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'downloading' | 'done' | 'error' | 'info'>('intro');
  const [message, setMessage] = useState('Game Theme Song needs a small helper file before it can find and play music.');
  const [icons, setIcons] = useState<ModalIcons>({...modalIcons });
  const downloadStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedIcons = await loadModalIcons();
        if (!cancelled) setIcons({...loadedIcons });
        backendLog('react setup check: start');
        const raw = await welcomeGetState();
        backendLog(`react setup check: raw ${String(raw).slice(0, 200)}`);
        const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!cancelled && !s?.ytdlp_present && !(window as any).__gts_setup_later) {
          backendLog('react setup modal: showing');
          setShow(true);
        } else if (!cancelled) {
          removeSetupPatch();
        }
      } catch (e: any) {
        backendLog(`react setup check failed: ${String(e?.message ?? e)}`);
        if (!cancelled) setShow(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if ((window as any).__gts_force_setup) {
        (window as any).__gts_force_setup = false;
        if ((window as any).__gts_setup_later) return;
        downloadStarted.current = false;
        setPhase('intro');
        setProgress(0);
        setMessage('Game Theme Song needs a small helper file before it can find and play music.');
        setShow(true);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const start = async () => {
    if (downloadStarted.current && phase !== 'error') return;
    downloadStarted.current = true;
    setPhase('downloading');
    setProgress(0);
    setMessage('Downloading yt-dlp.exe. This is about 18 MB and only needs to happen once.');
    try {
      await downloadYtdlp(setProgress);
      setPhase('done');
      setProgress(100);
      setMessage('Setup completed successfully. Game Theme Song is ready.');
    } catch (e: any) {
      setPhase('error');
      downloadStarted.current = false;
      setMessage(String(e?.message ?? e ?? 'Download failed'));
      backendLog(`react hidden download failed: ${String(e?.message ?? e)}`);
    }
  };

  if (!show) return null;

  const close = () => {
    setShow(false);
    if (phase === 'done' || phase === 'info') removeSetupPatch();
  };
  const later = () => {
    (window as any).__gts_setup_later = true;
    setShow(false);
  };
  const showInfo = () => setPhase('info');
  const backToDone = () => setPhase('done');
  const isBusy = phase === 'downloading';
  const headerIcon =
    phase === 'done' ? icons.check :
    phase === 'info' ? icons.question :
    icons.music;
  const iconAlt =
    phase === 'done' ? 'Setup complete' :
    phase === 'info' ? 'Help' :
    'Music';
  const buttonBaseStyle = { flex: 1, minHeight: 47, padding: '0 14px', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '18px' };
  const primaryButtonStyle = {...buttonBaseStyle, background: '#67c1f5', color: '#111' };
  const secondaryButtonStyle = {...buttonBaseStyle, background: '#2a2a2a', color: '#ddd' };
  const disabledButtonStyle = {...buttonBaseStyle, background: '#2a2a2a', color: '#aaa', cursor: 'default' };
  const buttonLabel = (icon: string, text: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 18, lineHeight: '18px' }}>
      {icon && <img src={icon} alt="" style={{ width: 15, height: 15, display: 'block', objectFit: 'contain', flex: '0 0 15px' }} />}
      <span style={{ display: 'block', lineHeight: '18px' }}>{text}</span>
    </span>
  );
  const accentTone =
    phase === 'done' ? 'green' :
    phase === 'info' ? 'gold' :
    'blue';
  const headerBg =
    accentTone === 'green' ? 'rgba(53,196,106,.14)' :
    accentTone === 'gold' ? 'rgba(245,200,75,.13)' :
    'rgba(103,193,245,.13)';
  const headerBorder =
    accentTone === 'green' ? '1px solid rgba(53,196,106,.35)' :
    accentTone === 'gold' ? '1px solid rgba(245,200,75,.34)' :
    '1px solid rgba(103,193,245,.3)';
  const headerShadow =
    accentTone === 'green' ? '0 0 32px rgba(53,196,106,.28)' :
    accentTone === 'gold' ? '0 0 32px rgba(245,200,75,.18)' :
    '0 0 32px rgba(103,193,245,.18)';

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999998, background: 'rgba(0,0,0,.82)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 999999, width: 460, background: '#101010', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, color: '#ddd', fontFamily: 'Arial,sans-serif', boxShadow: '0 22px 75px rgba(0,0,0,.72)', overflow: 'hidden' }}>
        <div style={{ padding: '28px 28px 12px', textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, margin: '0 auto 14px', borderRadius: '50%', background: headerBg, border: headerBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: headerShadow }}>
            {headerIcon ? (
              <img src={headerIcon} alt={iconAlt} style={{ width: phase === 'done' ? 34 : 32, height: phase === 'done' ? 34 : 32, display: 'block', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: phase === 'done' ? '#35c46a' : '#67c1f5' }} />
            )}
          </div>
          <h2 style={{ margin: '0 0 8px', color: '#fff', fontSize: 22, lineHeight: 1.2 }}>
            {phase === 'info' ? 'How It Works' : 'Game Theme Song'}
          </h2>
          <div style={{ fontSize: 12, color: '#8d8d8d', textTransform: 'uppercase', letterSpacing:.5 }}>
            {phase === 'intro' && 'helper required'}
            {phase === 'downloading' && `downloading ${progress}%`}
            {phase === 'done' && 'successful'}
            {phase === 'error' && 'download failed'}
            {phase === 'info' && 'quick guide'}
          </div>
        </div>
        <div style={{ padding: '10px 28px 8px', fontSize: 14, lineHeight: 1.55, color: '#c7c7c7' }}>
          {phase === 'intro' && (
            <div>
              To play music from each game page, this plugin needs to download yt-dlp.exe, a helper file used to find playable audio. The download is about 18 MB and is saved inside the plugin folder.
              <div style={{ marginTop: 10, color: '#969696', fontSize: 13 }}>You can install it now or choose Later. If you choose Later, this message will appear again the next time Steam starts.</div>
            </div>
          )}
          {phase === 'downloading' && message}
          {phase === 'done' && message}
          {phase === 'error' && message}
          {phase === 'info' && (
            <div>
              Open a game in your Steam Library and the plugin will search for a matching theme song, then play it in the background. The first play for a game can take longer because the plugin has to search and prepare a fresh audio link.
              <div style={{ marginTop: 10 }}>After that, the result is cached for a while, so returning to the same game is usually much faster.</div>
            </div>
          )}
        </div>
        {(phase === 'downloading' || phase === 'done') && (
          <div style={{ padding: '12px 28px 0' }}>
            <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: phase === 'done' ? '#35c46a' : '#67c1f5', transition: 'width.15s' }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, padding: '24px 28px 28px' }}>
          {phase === 'intro' && (
            <>
              <button onClick={later} style={secondaryButtonStyle}>Later</button>
              <button onClick={start} style={primaryButtonStyle}>{buttonLabel(icons.musicDark, 'Download')}</button>
            </>
          )}
          {phase === 'downloading' && (
            <button disabled style={disabledButtonStyle}>Installing...</button>
          )}
          {phase === 'done' && (
            <>
              <button onClick={close} style={secondaryButtonStyle}>{buttonLabel(icons.exit, 'Exit')}</button>
              <button onClick={showInfo} style={primaryButtonStyle}>{buttonLabel(icons.questionDark, 'How It Works')}</button>
            </>
          )}
          {phase === 'info' && (
            <>
              <button onClick={backToDone} style={secondaryButtonStyle}>Back</button>
              <button onClick={close} style={primaryButtonStyle}>{buttonLabel(icons.exitDark, 'Exit')}</button>
            </>
          )}
          {phase === 'error' && (
            <>
              <button onClick={later} style={secondaryButtonStyle}>Later</button>
              <button onClick={start} disabled={isBusy} style={primaryButtonStyle}>{buttonLabel(icons.musicDark, 'Retry')}</button>
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
    if (resp?.error === 'ytdlp_not_installed') {
      showSetupModal();
      return;
    }
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
    if (mySeq === activeSeq && r2?.ok && r2.url) await playUrl(r2.url, mySeq, getSeq);
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
          state.settings = {...state.settings,...s };
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
  setTimeout(() => void maybeShowSetup(), 1000);
  setTimeout(() => void maybeShowSetup(), 5000);
  startPolling();
  return {
    title: 'Game Theme Song',
    icon: <IconsModule.Music />,
    content: <SettingsContent />,
    onDismount() {
      removeSetupPatch();
    },
  };
});
