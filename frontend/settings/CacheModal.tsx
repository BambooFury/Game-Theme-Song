import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { ModalRoot, DialogHeader, DialogBody, DialogButton, TextField, showModal } from '@steambrew/client';
import { SETTINGS_CSS, SETTINGS_ICONS } from '../_assets.generated';
import { warn } from '../core/log';
import { base64ToUtf8 } from '../core/base64';
import { getCacheList, clearCacheFor, clearAudioCache } from '../core/api';
import { stopAudio, getCurrentAppId, resetPlayback, setGlobalCacheInfo, getPendingConfirmAppId } from '../core/engine';
import type { CacheItem } from '../core/types';
import { getLibraryApps } from './library';

const TRASH_HTML = { __html: SETTINGS_ICONS.trash };
const SUB_STYLE: React.CSSProperties = { margin: '0 0 10px', color: 'rgba(255,255,255,0.55)', fontSize: '12px' };
const ERROR_STYLE: React.CSSProperties = { color: '#ff8175', textAlign: 'center', padding: '8px 0', fontSize: '12px' };
const LIST_STYLE: React.CSSProperties = { height: '300px', overflowY: 'auto', padding: '10px 0' };

function thumbCandidates(appid: number): string[] {
  return [
    'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/header.jpg',
    'https://steamcdn-a.akamaihd.net/steam/apps/' + appid + '/header.jpg',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/capsule_231x87.jpg',
  ];
}

interface CacheRowProps {
  key?: React.Key;
  item: CacheItem;
  busy: boolean;
  onDelete: (item: CacheItem) => void;
}

const CacheRow = memo(function CacheRow({ item, busy, onDelete }: CacheRowProps) {
  const urls = useMemo(() => thumbCandidates(item.appid), [item.appid]);
  const [idx, setIdx] = useState(0);
  const failed = idx >= urls.length;
  return (
    <div className="gts-cache-row">
      <div className="gts-cache-thumb">
        {failed
          ? <div className="gts-cache-thumb-fb">{item.name.slice(0, 1).toUpperCase()}</div>
          : <img src={urls[idx]} alt="" loading="lazy" decoding="async" onError={() => setIdx((i) => i + 1)} />}
      </div>
      <div className="gts-cache-info">
        <div className="gts-cache-name">{item.name}</div>
        <div className="gts-cache-meta">{item.title ? item.title + ' · ' : ''}{(item.bytes / 1048576).toFixed(1)} MB</div>
      </div>
      <button className="gts-lib-mini gts-danger" disabled={busy} onClick={() => onDelete(item)} dangerouslySetInnerHTML={TRASH_HTML} />
    </div>
  );
});

interface CacheModalProps {
  closeModal?: () => void;
}

const CacheModal: React.FC<CacheModalProps> = ({ closeModal }) => {
  const [items, setItems] = useState<CacheItem[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const close = () => { closeModal?.(); };

  const broadcast = (list: CacheItem[]) => {
    setGlobalCacheInfo({ count: list.length, bytes: list.reduce((s, x) => s + x.bytes, 0) });
  };

  useEffect(() => {
    (async () => {
      try {
        const nameById = new Map<number, string>();
        for (const a of getLibraryApps()) nameById.set(a.appid, a.name);
        const raw = await getCacheList();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!info?.ok || !info.items) {
          if (info?.error === 'busy') setError('Search in progress — try again in a moment.');
          setItems([]);
          if (info?.error !== 'busy') broadcast([]);
          return;
        }
        const pendingId = getPendingConfirmAppId();
        const list: CacheItem[] = [];
        for (const k in info.items) {
          const it = info.items[k] || {};
          const appid = Number(k);
          if (pendingId != null && appid === pendingId) continue;
          const backendName = base64ToUtf8(it.name_b64 ?? '');
          list.push({ appid, name: nameById.get(appid) ?? (backendName || 'App ' + appid), title: base64ToUtf8(it.title_b64 ?? ''), bytes: Number(it.bytes ?? 0) });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
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
      const raw = await clearCacheFor({ app_id: item.appid });
      const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!r?.ok) { setError('Could not remove this track.'); return; }
      if (getCurrentAppId() === item.appid) { stopAudio(0); resetPlayback(); }
      setItems((prev) => {
        const next = (prev ?? []).filter((x) => x.appid !== item.appid);
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

  const count = items?.length ?? 0;
  const totalBytes = (items ?? []).reduce((s, x) => s + x.bytes, 0);

  const visible = useMemo(() => {
    const list = items ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((x) => x.name.toLowerCase().includes(q)) : list;
  }, [items, query]);

  const subText = count > 0
    ? count + ' ' + (count === 1 ? 'track' : 'tracks') + ' · ' + (totalBytes / 1048576).toFixed(1) + ' MB on disk'
    : 'Nothing downloaded yet.';

  return (
    <ModalRoot closeModal={close} onCancel={close} onEscKeypress={close}>
      <style>{SETTINGS_CSS}</style>
      <DialogHeader>Downloaded music</DialogHeader>
      <DialogBody>
        <div style={SUB_STYLE}>{subText}</div>
        {count > 0 && (
          <TextField label="Search" value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} />
        )}
        {error && <div style={ERROR_STYLE}>{error}</div>}
        <div style={LIST_STYLE} className="gts-cache-list">
          {items === null && <div className="gts-lib-loading">Loading…</div>}
          {items !== null && count === 0 && <div className="gts-lib-empty">Auto-downloaded themes will show up here.</div>}
          {items !== null && count > 0 && visible.length === 0 && <div className="gts-lib-empty">No tracks match “{query}”.</div>}
          {visible.map((item) => (
            <CacheRow key={item.appid} item={item} busy={busyId === item.appid} onDelete={onDelete} />
          ))}
        </div>
        {count > 0 && (
          <DialogButton disabled={clearingAll} onClick={() => { void onClearAll(); }}>
            {clearingAll ? 'Clearing…' : 'Clear all'}
          </DialogButton>
        )}
        <div className="gts-lib-foot">
          Removing a track frees disk space — it re-downloads automatically next time you open that game's page.
        </div>
      </DialogBody>
    </ModalRoot>
  );
};

export function openCacheWindow(): void {
  let handle: ReturnType<typeof showModal> | null = null;
  handle = showModal(
    <CacheModal />,
    window,
    {
      strTitle: 'Downloaded music',
      bNeverPopOut: true,
      popupWidth: 760,
      popupHeight: 560,
    },
  );
  void handle;
}