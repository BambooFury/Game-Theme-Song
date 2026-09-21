import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DialogBody, DialogBodyText, DialogButton, DialogButtonSecondary, DialogHeader, Field, TextField } from 'millennium';
import { warn } from '../core/log';
import { base64ToUtf8 } from '../core/base64';
import { clearAudioCache, clearCacheFor, getCacheList } from '../core/api';
import { getCurrentAppId, getPendingConfirmAppId, resetPlayback, setGlobalCacheInfo, stopAudio } from '../core/engine';
import type { CacheItem } from '../core/types';
import { getLibraryApps } from './library';

const LIST_SCROLL: React.CSSProperties = { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' };
const bytesToMegabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

const CacheRow: React.FC<{ item: CacheItem; busy: boolean; onDelete: (item: CacheItem) => void }> = ({ item, busy, onDelete }) => (
  <Field label={item.name} description={`${item.title ? `${item.title} · ` : ''}${bytesToMegabytes(item.bytes)}`}>
    <DialogButtonSecondary disabled={busy} onClick={() => onDelete(item)}>
      {busy ? 'Removing…' : 'Remove'}
    </DialogButtonSecondary>
  </Field>
);

export const CacheModalContent: React.FC = () => {
  const [items, setItems] = useState<CacheItem[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const broadcast = (list: CacheItem[]) => setGlobalCacheInfo({ count: list.length, bytes: list.reduce((total, item) => total + item.bytes, 0) });

  useEffect(() => {
    void (async () => {
      try {
        const nameById = new Map(getLibraryApps().map((app) => [app.appid, app.name]));
        const raw = await getCacheList();
        const response = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!response?.ok || !response.items) {
          if (response?.error === 'busy') setError('Search is in progress — try again in a moment.');
          setItems([]);
          if (response?.error !== 'busy') broadcast([]);
          return;
        }
        const pendingId = getPendingConfirmAppId();
        const list = Object.entries(response.items)
          .filter(([id]) => Number(id) !== pendingId)
          .map(([id, value]: [string, any]) => ({
            appid: Number(id),
            name: nameById.get(Number(id)) ?? (base64ToUtf8(value.name_b64 ?? '') || `App ${id}`),
            title: base64ToUtf8(value.title_b64 ?? ''),
            bytes: Number(value.bytes ?? 0),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setItems(list);
        broadcast(list);
      } catch (e) {
        warn('getCacheList failed', e);
        setItems([]);
      }
    })();
  }, []);

  const onDelete = useCallback(async (item: CacheItem) => {
    setBusyId(item.appid);
    setError(null);
    try {
      const raw = await clearCacheFor(item.appid);
      const response = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!response?.ok) {
        setError('Could not remove this track.');
        return;
      }
      if (getCurrentAppId() === item.appid) {
        stopAudio(0);
        resetPlayback();
      }
      setItems((previous) => {
        const next = (previous ?? []).filter((entry) => entry.appid !== item.appid);
        broadcast(next);
        return next;
      });
    } catch (e) {
      warn('clearCacheFor failed', e);
      setError('Could not remove this track.');
    } finally {
      setBusyId(null);
    }
  }, []);

  const onClearAll = useCallback(async () => {
    setClearingAll(true);
    setError(null);
    try {
      await clearAudioCache();
      stopAudio(0);
      resetPlayback();
      setItems([]);
      broadcast([]);
    } catch (e) {
      warn('clearAudioCache failed', e);
      setError('Could not clear downloaded music.');
    } finally {
      setClearingAll(false);
    }
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (items ?? []).filter((item) => !normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const totalBytes = (items ?? []).reduce((total, item) => total + item.bytes, 0);
  return (
    <>
      <DialogHeader>Downloaded music</DialogHeader>
      <DialogBody>
        <DialogBodyText>{items?.length ? `${items.length} track${items.length === 1 ? '' : 's'} · ${bytesToMegabytes(totalBytes)} on disk` : 'Nothing downloaded yet.'}</DialogBodyText>
        {(items?.length ?? 0) > 0 && <TextField label="Search tracks" value={query} onChange={(event) => setQuery(event.target.value)} />}
        {error && <DialogBodyText>{error}</DialogBodyText>}
        <div style={LIST_SCROLL}>
          {items === null && <DialogBodyText>Loading…</DialogBodyText>}
          {items !== null && items.length === 0 && <DialogBodyText>Auto-downloaded themes will appear here.</DialogBodyText>}
          {items !== null && items.length > 0 && visible.length === 0 && <DialogBodyText>No tracks match “{query}”.</DialogBodyText>}
          {visible.map((item) => <CacheRow key={item.appid} item={item} busy={busyId === item.appid} onDelete={onDelete} />)}
        </div>
        {(items?.length ?? 0) > 0 && <DialogButton disabled={clearingAll} onClick={() => void onClearAll()}>{clearingAll ? 'Clearing…' : 'Clear all downloaded music'}</DialogButton>}
      </DialogBody>
    </>
  );
};
