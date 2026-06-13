import React, { useState, useEffect } from 'react';
import { SETTINGS_CSS, SETTINGS_ICONS } from '../_assets.generated';
import { warn } from '../core/log';
import { getBackendSettings, setBackendSetting, getCacheInfo, getCustomList } from '../core/api';
import { state, getAudioEl, setLibWindowOpen, setCacheWindowOpen, setGlobalCustomCount, getCustomCount, subscribeCustomCount, subscribeCacheInfo } from '../core/engine';
import type { CacheInfo } from '../core/types';
import { ToggleRow, ButtonRow, SliderRow, formatLimit } from './rows';

export const SettingsContent: React.FC = () => {
  const [percent, setPercent] = useState(Math.round(state.settings.volume * 100));
  const [loop, setLoop] = useState(state.settings.loop);
  const [maxSec, setMaxSec] = useState(state.settings.max_seconds);
  const [stopOnLaunch, setStopOnLaunch] = useState(state.settings.stop_on_launch);
  const [manualSearch, setManualSearch] = useState(state.settings.manual_search);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [customCount, setCustomCount] = useState<number | null>(getCustomCount());
  useEffect(() => subscribeCustomCount(setCustomCount), []);
  useEffect(() => subscribeCacheInfo((info: CacheInfo) => { setCacheCount(info.count); setCacheBytes(info.bytes); }), []);
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
          setManualSearch(state.settings.manual_search);
          const a = getAudioEl();
          if (a) a.volume = state.settings.volume;
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
    const a = getAudioEl();
    if (a && !a.paused) a.volume = vol;
  };
  const onLoop = (checked: boolean) => {
    setLoop(checked);
    state.settings.loop = checked;
    void setBackendSetting({ key: 'loop', value: checked }).catch(e => warn('save loop failed', e));
    const a = getAudioEl();
    if (a) a.loop = checked;
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
  const onManualSearch = (checked: boolean) => {
    setManualSearch(checked);
    state.settings.manual_search = checked;
    void setBackendSetting({ key: 'manual_search', value: checked }).catch(e => warn('save manual_search failed', e));
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
      min={0}
      max={100}
      step={1}
      editable
      inputSuffix="%"
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
      icon={SETTINGS_ICONS.search}
      title="Manual song search"
      description={manualSearch
        ? 'When a theme is found, use the ✕ / ✓ buttons to pick a different song.'
        : 'Classic mode — just play the first theme found, no buttons to switch.'}
      checked={manualSearch}
      onChange={onManualSearch}
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
      title="Downloaded music"
      description={cacheCount === null ? 'Checking…' : cacheCount === 0 ? 'Nothing downloaded yet.' : `${cacheCount} ${cacheCount === 1 ? 'track' : 'tracks'} · ${(cacheBytes / 1048576).toFixed(1)} MB on disk`}
      buttonLabel="Manage"
      onClick={() => setCacheWindowOpen(true)}
    />
    </>
  );
};