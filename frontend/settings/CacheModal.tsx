import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { SETTINGS_CSS, SETTINGS_ICONS } from '../_assets.generated';
import { warn } from '../core/log';
import { base64ToUtf8 } from '../core/base64';
import { getCacheList, clearCacheFor, clearAudioCache } from '../core/api';
import { stopAudio, getCurrentAppId, resetPlayback, setGlobalCacheInfo, getCacheWindowOpen, setCacheWindowOpen, subscribeCacheWindow } from '../core/engine';
import type { CacheItem } from '../core/types';
import { getLibraryApps } from './library';

function thumbCandidates(appid: number): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`,
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
        <div className="gts-cache-meta">{item.title ? `${item.title} · ` : ''}{(item.bytes / 1048576).toFixed(1)} MB</div>
      </div>
      <button className="gts-lib-mini gts-danger" disabled={busy} onClick={() => onDelete(item)} dangerouslySetInnerHTML={{ __html: SETTINGS_ICONS.trash }} />
    </div>
  );
});

const CacheModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<CacheItem[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
        if (!info?.ok || !info.items) { setItems([]); return; }
        const list: CacheItem[] = [];
        for (const k in info.items) {
          const it = info.items[k] || {};
          const appid = Number(k);
          list.push({ appid, name: nameById.get(appid) ?? `App ${appid}`, title: base64ToUtf8(it.title_b64 ?? ''), bytes: Number(it.bytes ?? 0) });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setItems(list);
        broadcast(list);
      } catch (e) {
        warn('getCacheList failed', e);
        setItems([]);
      }
    })();
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

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

  return (
    <>
      <style>{SETTINGS_CSS}</style>
      <div className="gts-lib-dim" onMouseDown={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="gts-lib-dlg" role="dialog" aria-modal="true">
          <div className="gts-lib-head">
            <span className="gts-lib-head-ic" dangerouslySetInnerHTML={{ __html: SETTINGS_ICONS.trash }} />
            <span className="gts-lib-head-text">
              <div className="gts-lib-title">Downloaded music</div>
              <div className="gts-lib-sub">
                {count > 0 ? `${count} ${count === 1 ? 'track' : 'tracks'} · ${(totalBytes / 1048576).toFixed(1)} MB on disk` : 'Nothing downloaded yet.'}
              </div>
            </span>
            {count > 0 && <button className="gts-cache-clearall" disabled={clearingAll} onClick={() => { void onClearAll(); }}>{clearingAll ? 'Clearing…' : 'Clear all'}</button>}
            <button className="gts-lib-x" aria-label="Close" onClick={onClose}>✕</button>
          </div>

          {count > 0 && (
            <div className="gts-lib-search">
              <input type="text" placeholder="Search downloaded music…" value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} />
            </div>
          )}

          {error && <div className="gts-lib-foot" style={{ color: '#ff8585' }}>{error}</div>}

          <div className="gts-cache-list">
            {items === null && <div className="gts-lib-loading">Loading…</div>}
            {items !== null && count === 0 && <div className="gts-lib-empty">Auto-downloaded themes will show up here.</div>}
            {items !== null && count > 0 && visible.length === 0 && <div className="gts-lib-empty">No tracks match “{query}”.</div>}
            {visible.map((item) => (
              <CacheRow key={item.appid} item={item} busy={busyId === item.appid} onDelete={onDelete} />
            ))}
          </div>

          <div className="gts-lib-foot">
            Removing a track frees disk space — it re-downloads automatically next time you open that game's page.
          </div>
        </div>
      </div>
    </>
  );
};

export const CacheWindow: React.FC = () => {
  const [open, setOpen] = useState(getCacheWindowOpen());

  useEffect(() => subscribeCacheWindow(setOpen), []);

  if (!open) return null;

  return <CacheModal onClose={() => setCacheWindowOpen(false)} />;
};