import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { SETTINGS_CSS, SETTINGS_ICONS } from '../_assets.generated';
import { warn } from '../core/log';
import { readFileBase64 } from '../core/base64';
import { getCustomList, clearCustomMusic } from '../core/api';
import { reapplyForApp, setLibWindowOpen, setGlobalCustomCount, getLibWindowOpen, subscribeLibWindow } from '../core/engine';
import type { LibApp, CustomMap } from '../core/types';
import { ACCEPT_EXTS, MAX_UPLOAD_BYTES, MAX_CARDS, decodeCustomItems, getLibraryApps, uploadCustomMusic } from './library';

function coverCandidates(app: LibApp): string[] {
  const appid = app.appid;
  const list: string[] = [];
  if (app.cover) list.push(app.cover);
  list.push(
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_616x353.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appid}/header.jpg`,
  );
  return list;
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
  const urls = useMemo(() => coverCandidates(app), [app.appid, app.cover]);
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
      commit({ ...customMapRef.current, [String(app.appid)]: { title: file.name.replace(/\.[^.]+$/, ''), name: app.name } });
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

export const LibraryWindow: React.FC = () => {
  const [open, setOpen] = useState(getLibWindowOpen());

  useEffect(() => subscribeLibWindow(setOpen), []);

  if (!open) return null;

  return (
    <LibraryModal
      onClose={() => setLibWindowOpen(false)}
      onChanged={(map) => setGlobalCustomCount(Object.keys(map).length)}
    />
  );
};
