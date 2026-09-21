import React, { useEffect, useState } from 'react';
import { ButtonItem, DialogBody, DialogBodyText, DialogButton, DialogButtonSecondary, DialogHeader, SliderField, ToggleField } from 'millennium';
import { MdMusicNote, MdSkipNext, MdStop, MdCheckCircle, MdSettings, MdLibraryMusic, MdDownload } from 'react-icons/md';
import { warn } from './log';
import { getBackendSettings, setBackendSetting, getCacheInfo, getCustomList } from './api';
import {
  state, getAudioEl, setGlobalCustomCount, getCustomCount, subscribeCustomCount,
  subscribeCacheInfo, subscribeContext, getContext, subscribePlayback, isPlaying,
  rerollCurrent, acceptCurrent, stopAudio, getPendingConfirmAppId,
} from './engine';
import { openManagerPopup } from '../settings/managerPopups';
import { LibraryModalContent } from '../settings/LibraryModal';
import { CacheModalContent } from '../settings/CacheModal';
import type { CacheInfo, ContextState } from './types';

const formatLimit = (sec: number) => {
  if (sec <= 0) return 'Off';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
};

const TAB_BTN: React.CSSProperties = {
  padding: '10px 18px',
  position: 'relative',
  zIndex: 2,
  WebkitAppRegion: 'no-drag',
};

type TabId = 'nowplaying' | 'settings' | 'library' | 'cache';

function NowPlayingTab(): React.JSX.Element {
  const [ctx, setCtx] = useState<ContextState>(getContext());
  const [playing, setPlaying] = useState(isPlaying());
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pending, setPending] = useState(getPendingConfirmAppId());

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

  const mode = ctx.mode;
  const hasGame = ctx.appId != null && ctx.gameName != null;
  const showProgress = playing && duration > 0;

  const statusText = mode === 'searching'
    ? 'Searching for theme music…'
    : playing
      ? `Playing: ${ctx.title ?? 'theme music'}`
      : mode === 'ready'
        ? `Ready: ${ctx.title ?? 'theme music'}`
        : hasGame
          ? 'No theme found for this game'
          : 'No game open';

  const pct = showProgress && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  const timeLabel = showProgress && duration > 0
    ? `${Math.floor(progress / 60)}:${String(Math.floor(progress % 60)).padStart(2, '0')} / ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 16px' }}>
      <DialogHeader>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <MdMusicNote size={18} />
          {ctx.gameName ?? 'No game open'}
        </span>
      </DialogHeader>
      <DialogBody>
        <DialogBodyText>{statusText}</DialogBodyText>
        {showProgress && (
          <>
            <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', margin: '8px 0 4px' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--color-online, #5dc26a)' }} />
            </div>
            {timeLabel && <DialogBodyText>{timeLabel}</DialogBodyText>}
          </>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          {pending != null ? (
            <>
              {state.settings.manual_search && (mode === 'ready' || playing) && (
                <DialogButtonSecondary
                  disabled={mode === 'searching'}
                  onClick={() => void rerollCurrent()}
                >
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
          ) : null}
        </div>
        {!hasGame && (
          <DialogBodyText>Open a game page in your library to see its theme music here.</DialogBodyText>
        )}
      </DialogBody>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px' }}>
      <SliderField
        label="Music volume"
        description={percent > 0 ? 'Background theme music volume.' : 'Theme music is muted.'}
        value={percent}
        min={0}
        max={100}
        step={1}
        showValue
        editableValue
        valueSuffix="%"
        onChange={onSlider}
      />
      <SliderField
        label="Song length limit"
        description={maxSec > 0
          ? (loop ? `The song restarts after ${formatLimit(maxSec)}.` : `The song stops after ${formatLimit(maxSec)}.`)
          : 'The full song plays.'}
        value={maxSec}
        min={0}
        max={300}
        step={5}
        showValue
        editableValue
        valueSuffix="s"
        onChange={onLimit}
      />
      <ToggleField
        label="Loop song"
        description={loop ? 'The theme song repeats while you stay on the game page.' : 'The theme song plays once and stops.'}
        checked={loop}
        onChange={onLoop}
      />
      <ToggleField
        label="Manual song search"
        description={manualSearch
          ? 'When a theme is found, use the skip button to pick a different song.'
          : 'Classic mode — just play the first theme found, no skip button.'}
        checked={manualSearch}
        onChange={onManualSearch}
      />
      <ToggleField
        label="Keep songs only after keeping"
        description={confirmDl
          ? 'A found song is deleted if you leave the page without keeping it.'
          : 'Every found song stays in the download cache automatically.'}
        checked={confirmDl}
        onChange={onConfirmDl}
      />
      <ToggleField
        label="Stop on game launch"
        description={stopOnLaunch ? 'Theme music stops when you launch a game.' : 'Theme music keeps playing when a game starts.'}
        checked={stopOnLaunch}
        onChange={onStopOnLaunch}
      />
    </div>
  );
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'nowplaying', label: 'Now Playing', icon: <MdMusicNote size={16} /> },
  { id: 'settings', label: 'Settings', icon: <MdSettings size={15} /> },
  { id: 'cache', label: 'Downloaded', icon: <MdDownload size={16} /> },
  { id: 'library', label: 'Custom Music', icon: <MdLibraryMusic size={16} /> },
];

interface MainPopupProps {
  onDismiss: () => void;
}

export const MainPopupContent: React.FC<MainPopupProps> = ({ onDismiss }) => {
  const [activeTab, setActiveTab] = useState<TabId>('nowplaying');
  const [customCount, setCustomCount] = useState<number | null>(getCustomCount());
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [cacheBytes, setCacheBytes] = useState(0);

  useEffect(() => subscribeCustomCount(setCustomCount), []);
  useEffect(() => subscribeCacheInfo((info: CacheInfo) => { setCacheCount(info.count); setCacheBytes(info.bytes); }), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: '8px' }}>
      <div style={{ display: 'flex', gap: '6px', padding: '0 16px 4px', flexWrap: 'wrap', position: 'relative', zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {TABS.map((tab) => (
          <DialogButton
            key={tab.id}
            style={{ ...TAB_BTN, fontWeight: activeTab === tab.id ? 700 : 400, opacity: activeTab === tab.id ? 1 : 0.6 }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
              {tab.icon}
              {tab.label}
              {tab.id === 'library' && customCount != null && customCount > 0 && (
                <span style={{ fontSize: '10px', opacity: 0.6 }}>{customCount}</span>
              )}
              {tab.id === 'cache' && cacheCount != null && cacheCount > 0 && (
                <span style={{ fontSize: '10px', opacity: 0.6 }}>{cacheCount}</span>
              )}
            </span>
          </DialogButton>
        ))}
      </div>
      {activeTab === 'nowplaying' && <NowPlayingTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'library' && <LibraryModalContent onChanged={(map) => setGlobalCustomCount(Object.keys(map).length)} />}
      {activeTab === 'cache' && <CacheModalContent />}
    </div>
  );
};
