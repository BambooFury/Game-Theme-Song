import React, { useEffect, useRef, useState } from 'react';
import { DialogBody, DialogBodyText, DialogButton, DialogButtonSecondary, DialogHeader, SliderField, ToggleField } from 'millennium';
import { MdMusicNote, MdSkipNext, MdStop, MdCheckCircle, MdSettings, MdLibraryMusic, MdDownload, MdSearch, MdSportsEsports, MdUploadFile, MdDeleteOutline } from 'react-icons/md';
import { warn } from './log';
import { getBackendSettings, setBackendSetting, getCacheInfo, getCustomList, clearFallbackMusic, exportCollection, importCollection } from './api';
import { readFileBase64 } from './base64';
import { ACCEPT_EXTS, MAX_UPLOAD_BYTES, uploadCustomMusic, uploadFallbackMusic } from '../settings/library';
import {
  state, getAudioEl, setGlobalCustomCount, setGlobalCacheInfo, getCustomCount, subscribeCustomCount,
  subscribeCacheInfo, subscribeContext, getContext, subscribePlayback, isPlaying, reapplyForApp,
  rerollCurrent, acceptCurrent, stopAudio, getPendingConfirmAppId,
} from './engine';
import { LibraryModalContent } from '../settings/LibraryModal';
import { CacheModalContent } from '../settings/CacheModal';
import type { CacheInfo, ContextState } from './types';

const formatLimit = (sec: number) => {
  if (sec <= 0) return 'Off';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
};

type TabId = 'nowplaying' | 'settings' | 'cache' | 'library';

const TAB_CSS = `
.gts-row-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: stretch;
}
.gts-tab-count {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.7;
  background: rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 1px 6px;
}
`;

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '9px 16px',
  fontWeight: active ? 700 : 400,
  opacity: active ? 1 : 0.62,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  position: 'relative',
  zIndex: 2,
  WebkitAppRegion: 'no-drag',
} as React.CSSProperties);

function NowPlayingTab(): React.JSX.Element {
  const [ctx, setCtx] = useState<ContextState>(getContext());
  const [playing, setPlaying] = useState(isPlaying());
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pending, setPending] = useState(getPendingConfirmAppId());
  const [savingCustom, setSavingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const customFileRef = useRef<HTMLInputElement | null>(null);
  const [savingFallback, setSavingFallback] = useState(false);
  const fallbackFileRef = useRef<HTMLInputElement | null>(null);
  const onFallbackPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const appId = ctx.appId;
    if (!file || appId == null) return;
    setSavingFallback(true);
    try {
      const response = await uploadFallbackMusic(file.name, await readFileBase64(file));
      if (response?.ok) void reapplyForApp(appId);
    } catch (e) {
      warn('set fallback failed', e);
    } finally {
      setSavingFallback(false);
    }
  };

  useEffect(() => subscribeContext(setCtx), []);
  useEffect(() => subscribePlayback(() => setPlaying(isPlaying())), []);

  useEffect(() => {
    const id = setInterval(() => {
      const a = getAudioEl();
      if (a && !a.paused) {
        setProgress(a.currentTime);
        setDuration(a.duration || 0);
      }
      setPending(getPendingConfirmAppId());
    }, 500);
    return () => clearInterval(id);
  }, []);

  const onCustomFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const appId = ctx.appId;
    const gameName = ctx.gameName;
    if (!file || appId == null || !gameName) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setCustomError(`"${file.name}" is too large (maximum 50 MB).`);
      return;
    }
    setSavingCustom(true);
    setCustomError(null);
    try {
      const response = await uploadCustomMusic(appId, gameName, file.name, await readFileBase64(file));
      if (!response?.ok) {
        setCustomError(`Couldn't set music: ${response?.error ?? 'unknown error'}.`);
        return;
      }
      try {
        const raw = await getCustomList();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (info?.ok && info.items) setGlobalCustomCount(Object.keys(info.items).length);
      } catch (e) { warn('getCustomList failed', e); }
      void reapplyForApp(appId);
    } catch (e) {
      warn('set custom failed', e);
      setCustomError('Something went wrong while saving the file.');
    } finally {
      setSavingCustom(false);
    }
  };

  const mode = ctx.mode;
  const hasGame = ctx.appId != null && ctx.gameName != null;
  const showProgress = playing && duration > 0;
  const searching = mode === 'searching';

  const statusText = searching
    ? 'Searching for theme music…'
    : playing
      ? `Playing: ${ctx.title ?? 'theme music'}`
      : mode === 'ready'
        ? `Ready: ${ctx.title ?? 'theme music'}`
        : ctx.title
          ? `Stopped: ${ctx.title}`
          : 'No theme found for this game';

  const pct = showProgress && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const timeLabel = showProgress && duration > 0
    ? `${Math.floor(progress / 60)}:${String(Math.floor(progress % 60)).padStart(2, '0')} / ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '16px', minHeight: 0, flex: 1 }}>
      {hasGame && (
        <DialogHeader>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <MdMusicNote size={18} />
            {ctx.gameName}
          </span>
        </DialogHeader>
      )}
      {!hasGame ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', flex: 1, padding: '24px', textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(103,193,245,0.1)', border: '1px solid rgba(103,193,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MdSportsEsports size={36} style={{ color: '#67c1f5', opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--main-text-color, #ffffff)' }}>No game open</div>
          <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--secondary-text-color, rgba(255,255,255,0.5))', maxWidth: '320px' }}>Open a game page in your library to hear its theme music here.</div>
        </div>
      ) : searching ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', flex: 1, padding: '40px 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(103,193,245,0.1)', border: '1px solid rgba(103,193,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MdSearch size={28} style={{ color: '#67c1f5', opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--main-text-color, #fff)' }}>Searching for theme music</div>
          <div style={{ fontSize: '12px', color: 'var(--secondary-text-color, rgba(255,255,255,0.5))' }}>Looking for a track for this game…</div>
        </div>
      ) : (
        <DialogBody>
          <DialogBodyText>{statusText}</DialogBodyText>
          {showProgress && (
            <>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', margin: '8px 0 4px' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--color-online, #5dc26a)', transition: 'width 0.5s linear' }} />
              </div>
              {timeLabel && <DialogBodyText>{timeLabel}</DialogBodyText>}
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            {pending != null ? (
              <>
                {state.settings.manual_search && (mode === 'ready' || playing) && (
                  <DialogButtonSecondary disabled={false} onClick={() => void rerollCurrent()}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <MdSkipNext size={16} />
                      Find another
                    </span>
                  </DialogButtonSecondary>
                )}
                {playing && (
                  <DialogButtonSecondary onClick={() => stopAudio(0.5)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <MdStop size={16} />
                      Stop
                    </span>
                  </DialogButtonSecondary>
                )}
                <DialogButton onClick={() => acceptCurrent()}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MdCheckCircle size={16} />
                    Keep this song
                  </span>
                </DialogButton>
              </>
            ) : playing && mode === 'ready' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-online, #5dc26a)' }}>
                <MdCheckCircle size={18} />
                <span style={{ fontSize: '13px' }}>Song saved</span>
              </span>
            ) : !playing && !searching ? (
              <>
                {state.settings.manual_search && (
                  <DialogButtonSecondary onClick={() => rerollCurrent()}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <MdSearch size={16} />
                      Search again
                    </span>
                  </DialogButtonSecondary>
                )}
                <DialogButtonSecondary disabled={savingFallback} onClick={() => fallbackFileRef.current?.click()}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MdUploadFile size={16} />
                    {savingFallback ? 'Saving…' : 'Set default song'}
                  </span>
                </DialogButtonSecondary>
                <input ref={fallbackFileRef} type="file" accept={ACCEPT_EXTS} hidden onChange={(e) => void onFallbackPicked(e)} />
              </>
            ) : null}
            {hasGame && !searching && (
              <DialogButtonSecondary disabled={savingCustom} onClick={() => customFileRef.current?.click()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <MdUploadFile size={16} />
                  {savingCustom ? 'Saving…' : 'Set custom song'}
                </span>
              </DialogButtonSecondary>
            )}
          </div>
          {customError && (
            <div style={{ color: 'var(--color-offline, #e05252)', fontSize: '12px', marginTop: 8 }}>{customError}</div>
          )}
          <input ref={customFileRef} type="file" accept={ACCEPT_EXTS} hidden onChange={(e) => void onCustomFilePicked(e)} />
        </DialogBody>
      )}
    </div>
  );
}

function SettingsTab(): React.JSX.Element {
  const [percent, setPercent] = useState(Math.round(state.settings.volume * 100));
  const [loop, setLoop] = useState(state.settings.loop);
  const [maxSec, setMaxSec] = useState(state.settings.max_seconds);
  const [stopOnLaunch, setStopOnLaunch] = useState(state.settings.stop_on_launch);
  const [manualSearch, setManualSearch] = useState(state.settings.manual_search);
  const [confirmDl, setConfirmDl] = useState(state.settings.confirm_before_download);
  const [fadeSec, setFadeSec] = useState(state.settings.fade_seconds);
  const [fallbackTitle, setFallbackTitle] = useState(typeof state.settings.fallback_title === 'string' ? state.settings.fallback_title : '');
  const [fallbackSet, setFallbackSet] = useState(Boolean(state.settings.fallback_file));
  const [savingFallback, setSavingFallback] = useState(false);
  const fallbackFileRef = useRef<HTMLInputElement | null>(null);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionInfo, setCollectionInfo] = useState<string | null>(null);

  const onExportCollection = async () => {
    setCollectionBusy(true);
    try {
      const parse = (raw: unknown) => (typeof raw === 'string' ? JSON.parse(raw) : raw) as { ok?: boolean; path?: string; files?: number; error?: string };
      const r = parse(await exportCollection());
      if (r?.ok) setCollectionInfo(`Saved ${r.files} files to ${r.path}`);
      else if (r?.error === 'nothing_to_export') setCollectionInfo('Nothing to export yet.');
      else setCollectionInfo(`Export failed: ${r?.error ?? 'unknown'}`);
    } catch (e) {
      warn('export collection failed', e);
      setCollectionInfo('Export failed.');
    } finally {
      setCollectionBusy(false);
    }
  };

  const onImportCollection = async () => {
    setCollectionBusy(true);
    try {
      const parse = (raw: unknown) => (typeof raw === 'string' ? JSON.parse(raw) : raw) as { ok?: boolean; files?: number; error?: string };
      const r = parse(await importCollection());
      if (r?.ok) {
        setCollectionInfo(`Imported ${r.files} files.`);
        const raw = await getBackendSettings();
        const st = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (st && typeof st === 'object') {
          state.settings = { ...state.settings, ...st };
          setFallbackTitle(typeof state.settings.fallback_title === 'string' ? state.settings.fallback_title : '');
          setFallbackSet(Boolean(state.settings.fallback_file));
        }
      } else if (r?.error === 'no_collection_file') {
        setCollectionInfo('Put game-theme-song-collection.gtscollection into the backup folder first.');
      } else {
        setCollectionInfo(`Import failed: ${r?.error ?? 'unknown'}`);
      }
    } catch (e) {
      warn('import collection failed', e);
      setCollectionInfo('Import failed.');
    } finally {
      setCollectionBusy(false);
    }
  };

  const onFallbackPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSavingFallback(true);
    try {
      const response = await uploadFallbackMusic(file.name, await readFileBase64(file));
      if (!response?.ok) {
        warn('set fallback failed: ' + (response?.error ?? 'unknown'));
        return;
      }
      state.settings.fallback_file = 'fallback.mp3';
      state.settings.fallback_title = file.name.replace(/\.[^.]+$/, '');
      setFallbackTitle(state.settings.fallback_title);
      setFallbackSet(true);
    } catch (e) {
      warn('set fallback failed', e);
    } finally {
      setSavingFallback(false);
    }
  };

  const onFallbackClear = async () => {
    try {
      await clearFallbackMusic();
      state.settings.fallback_file = '';
      state.settings.fallback_title = '';
      setFallbackTitle('');
      setFallbackSet(false);
    } catch (e) {
      warn('clear fallback failed', e);
    }
  };

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
          setManualSearch(state.settings.manual_search);
          setConfirmDl(state.settings.confirm_before_download);
          setFadeSec(state.settings.fade_seconds);
          setFallbackTitle(typeof state.settings.fallback_title === 'string' ? state.settings.fallback_title : '');
          setFallbackSet(Boolean(state.settings.fallback_file));
          const a = getAudioEl();
          if (a) a.volume = state.settings.volume;
        }
      } catch (e) { warn('failed to load settings', e); }
    })();
  }, []);

  const onSlider = (p: number) => {
    const vol = Math.max(0, Math.min(1, Math.round(p) / 100));
    setPercent(Math.round(vol * 100));
    state.settings.volume = vol;
    void setBackendSetting('volume', vol).catch(e => warn('save volume failed', e));
    const a = getAudioEl();
    if (a && !a.paused) a.volume = vol;
  };

  const onFade = (sec: number) => {
    const v = Math.max(0, Math.min(5, Math.round(sec * 2) / 2));
    setFadeSec(v);
    state.settings.fade_seconds = v;
    void setBackendSetting('fade_seconds', v).catch(e => warn('save fade failed', e));
  };

  const onLoop = (checked: boolean) => {
    setLoop(checked);
    state.settings.loop = checked;
    void setBackendSetting('loop', checked).catch(e => warn('save loop failed', e));
    const a = getAudioEl();
    if (a) a.loop = checked;
  };

  const onLimit = (sec: number) => {
    const v = Math.max(0, Math.round(sec));
    setMaxSec(v);
    state.settings.max_seconds = v;
    void setBackendSetting('max_seconds', v).catch(e => warn('save max_seconds failed', e));
  };

  const onStopOnLaunch = (checked: boolean) => {
    setStopOnLaunch(checked);
    state.settings.stop_on_launch = checked;
    void setBackendSetting('stop_on_launch', checked).catch(e => warn('save stop_on_launch failed', e));
  };

  const onManualSearch = (checked: boolean) => {
    setManualSearch(checked);
    state.settings.manual_search = checked;
    void setBackendSetting('manual_search', checked).catch(e => warn('save manual_search failed', e));
  };

  const onConfirmDl = (checked: boolean) => {
    setConfirmDl(checked);
    state.settings.confirm_before_download = checked;
    void setBackendSetting('confirm_before_download', checked).catch(e => warn('save confirm_before_download failed', e));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <SliderField label="Music volume" description={percent > 0 ? 'Background theme music volume.' : 'Theme music is muted.'} value={percent} min={0} max={100} step={1} showValue editableValue valueSuffix="%" onChange={onSlider} />
      <SliderField label="Fade duration" description={fadeSec > 0 ? `Music fades in and out over ${fadeSec}s when switching or leaving games.` : 'Music switches instantly with no fade.'} value={fadeSec} min={0} max={5} step={0.5} showValue valueSuffix="s" onChange={onFade} />
      <SliderField label="Song length limit" description={maxSec > 0 ? (loop ? `The song restarts after ${formatLimit(maxSec)}.` : `The song stops after ${formatLimit(maxSec)}.`) : 'The full song plays.'} value={maxSec} min={0} max={300} step={5} showValue editableValue valueSuffix="s" onChange={onLimit} />
      <ToggleField label="Loop song" description={loop ? 'The theme song repeats while you stay on the game page.' : 'The theme song plays once and stops.'} checked={loop} onChange={onLoop} />
      <ToggleField label="Manual song search" description={manualSearch ? 'When a theme is found, use the skip button to pick a different song.' : 'Classic mode — just play the first theme found, no skip button.'} checked={manualSearch} onChange={onManualSearch} />
      <ToggleField label="Keep songs only after keeping" description={confirmDl ? 'A found song is deleted if you leave the page without keeping it.' : 'Every found song stays in the download cache automatically.'} checked={confirmDl} onChange={onConfirmDl} />
      <ToggleField label="Stop on game launch" description={stopOnLaunch ? 'Theme music stops when you launch a game.' : 'Theme music keeps playing when a game starts.'} checked={stopOnLaunch} onChange={onStopOnLaunch} />
      <div style={{ paddingTop: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Default song</div>
        <div style={{ fontSize: '12px', color: 'var(--secondary-text-color, rgba(255,255,255,0.5))' }}>
          {fallbackSet
            ? `Plays for games with no found theme. Current: ${fallbackTitle}`
            : 'Plays for games where no theme could be found.'}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <DialogButtonSecondary disabled={savingFallback} onClick={() => fallbackFileRef.current?.click()}>
            {savingFallback ? 'Saving…' : fallbackSet ? 'Replace' : 'Choose file'}
          </DialogButtonSecondary>
          {fallbackSet && (
            <DialogButtonSecondary disabled={savingFallback} onClick={() => void onFallbackClear()}>
              <MdDeleteOutline size={15} />
            </DialogButtonSecondary>
          )}
        </div>
        <input ref={fallbackFileRef} type="file" accept={ACCEPT_EXTS} hidden onChange={(e) => void onFallbackPicked(e)} />
      </div>
      <div style={{ paddingTop: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Collection backup</div>
        <div style={{ fontSize: '12px', color: 'var(--secondary-text-color, rgba(255,255,255,0.5))' }}>
          {collectionInfo ?? 'Export custom tracks, default song and settings into one file, or import one back.'}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <DialogButtonSecondary disabled={collectionBusy} onClick={() => void onExportCollection()}>Export</DialogButtonSecondary>
          <DialogButtonSecondary disabled={collectionBusy} onClick={() => void onImportCollection()}>Import</DialogButtonSecondary>
        </div>
      </div>
    </div>
  );
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'nowplaying', label: 'Now Playing', icon: <MdMusicNote size={15} /> },
  { id: 'settings', label: 'Settings', icon: <MdSettings size={14} /> },
  { id: 'cache', label: 'Downloaded', icon: <MdDownload size={15} /> },
  { id: 'library', label: 'Custom Music', icon: <MdLibraryMusic size={15} /> },
];

export const MainPopupContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('nowplaying');
  const [customCount, setCustomCount] = useState<number | null>(getCustomCount());
  const [cacheCount, setCacheCount] = useState<number | null>(null);

  useEffect(() => subscribeCustomCount(setCustomCount), []);
  useEffect(() => subscribeCacheInfo((info: CacheInfo) => setCacheCount(info.count)), []);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await getCacheInfo();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (info?.ok) setGlobalCacheInfo({ count: info.count, bytes: info.bytes });
      } catch (e) { warn('getCacheInfo failed', e); }
      try {
        const raw = await getCustomList();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (info?.ok && info.items) setGlobalCustomCount(Object.keys(info.items).length);
      } catch (e) { warn('getCustomList failed', e); }
    })();
  }, []);

  useEffect(() => {
    const id = 'gts-popup-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = TAB_CSS;
    document.head.appendChild(style);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '4px', padding: '8px 16px 0', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {TABS.map((tab) => (
          <DialogButton
            key={tab.id}
            style={tabStyle(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'library' && customCount != null && customCount > 0 && (
              <span className="gts-tab-count">{customCount}</span>
            )}
            {tab.id === 'cache' && cacheCount != null && cacheCount > 0 && (
              <span className="gts-tab-count">{cacheCount}</span>
            )}
          </DialogButton>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'nowplaying' && <NowPlayingTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'cache' && <CacheModalContent />}
        {activeTab === 'library' && <LibraryModalContent onChanged={(map) => setGlobalCustomCount(Object.keys(map).length)} />}
      </div>
    </div>
  );
};
