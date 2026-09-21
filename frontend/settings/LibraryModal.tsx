import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DialogBody, DialogBodyText, DialogButtonSecondary, DialogCheckbox, DialogHeader, Field, TextField } from 'millennium';
import { warn } from '../core/log';
import { readFileBase64 } from '../core/base64';
import { clearCustomMusic, getCustomList, getIgnoredList } from '../core/api';
import { reapplyForApp, setAppIgnored } from '../core/engine';
import type { CustomMap, LibApp } from '../core/types';
import { ACCEPT_EXTS, MAX_CARDS, MAX_UPLOAD_BYTES, decodeCustomItems, getLibraryApps, uploadCustomMusic } from './library';

const LIST_SCROLL: React.CSSProperties = { maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' };

const ICON_STYLE: React.CSSProperties = { width: 32, height: 32, objectFit: 'cover', borderRadius: 2 };

/** Resolves the best available icon image for an app and hides it if it fails to load. */
const AppIcon: React.FC<{ app: LibApp }> = ({ app }) => {
  const src = app.icon ?? app.cover ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/capsule_236x69.jpg`;
  return <img src={src} alt="" style={ICON_STYLE} loading="lazy" onError={(e) => { (e.currentTarget.style.display = 'none'); }} />;
};

interface GameRowProps {
  app: LibApp;
  customTitle?: string;
  busy: boolean;
  ignored: boolean;
  onSet: (app: LibApp) => void;
  onClear: (app: LibApp) => void;
  onToggleIgnore: (app: LibApp) => void;
}

const GameRow: React.FC<GameRowProps> = ({ app, customTitle, busy, ignored, onSet, onClear, onToggleIgnore }) => (
  <Field
    label={app.name}
    description={customTitle ? `Custom track: ${customTitle}` : 'Uses automatic theme search.'}
    icon={<AppIcon app={app} />}
    childrenLayout="below"
    childrenContainerWidth="max"
  >
    <DialogButtonSecondary style={{ padding: '4px 12px' }} disabled={busy} onClick={() => onSet(app)}>
      {busy ? 'Saving…' : customTitle ? 'Replace music' : 'Set music'}
    </DialogButtonSecondary>
    {customTitle && (
      <DialogButtonSecondary style={{ padding: '4px 12px' }} disabled={busy} onClick={() => onClear(app)}>
        Remove custom music
      </DialogButtonSecondary>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 16, pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto' }}>
        <DialogCheckbox
          bottomSeparator="none"
          checked={ignored}
          onChange={() => onToggleIgnore(app)}
        />
      </div>
      <DialogBodyText>Exclude from automatic search</DialogBodyText>
    </div>
  </Field>
);

interface LibraryModalProps {
  onChanged: (map: CustomMap) => void;
}

export const LibraryModalContent: React.FC<LibraryModalProps> = ({ onChanged }) => {
  const [apps, setApps] = useState<LibApp[] | null>(null);
  const [customMap, setCustomMap] = useState<CustomMap>({});
  const [ignoredMap, setIgnoredMap] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingApp = useRef<LibApp | null>(null);
  const customMapRef = useRef(customMap);
  const ignoredRef = useRef(ignoredMap);
  customMapRef.current = customMap;
  ignoredRef.current = ignoredMap;

  useEffect(() => {
    setApps(getLibraryApps());
    void (async () => {
      try {
        const raw = await getCustomList();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (info?.ok && info.items) setCustomMap(decodeCustomItems(info.items));
      } catch (e) { warn('getCustomList failed', e); }
      try {
        const raw = await getIgnoredList();
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (info?.ok && info.items) setIgnoredMap({ ...info.items });
      } catch (e) { warn('getIgnoredList failed', e); }
    })();
  }, []);

  const updateCustomMap = (map: CustomMap) => {
    setCustomMap(map);
    onChanged(map);
  };

  const onSet = useCallback((app: LibApp) => {
    setError(null);
    pendingApp.current = app;
    fileRef.current?.click();
  }, []);

  const onFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const app = pendingApp.current;
    pendingApp.current = null;
    if (!file || !app) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`“${file.name}” is too large (maximum 50 MB).`);
      return;
    }
    setBusyId(app.appid);
    setError(null);
    try {
      const response = await uploadCustomMusic(app.appid, app.name, file.name, await readFileBase64(file));
      if (!response?.ok) {
        setError(`Couldn't set music: ${response?.error ?? 'unknown error'}.`);
        return;
      }
      const next = { ...customMapRef.current, [String(app.appid)]: { title: file.name.replace(/\.[^.]+$/, ''), name: app.name } };
      updateCustomMap(next);
      void reapplyForApp(app.appid);
    } catch (e) {
      warn('set custom failed', e);
      setError('Something went wrong while saving the file.');
    } finally {
      setBusyId(null);
    }
  };

  const onClear = useCallback(async (app: LibApp) => {
    setBusyId(app.appid);
    setError(null);
    try {
      await clearCustomMusic(app.appid);
      const next = { ...customMapRef.current };
      delete next[String(app.appid)];
      updateCustomMap(next);
      void reapplyForApp(app.appid);
    } catch (e) {
      warn('clear custom failed', e);
      setError('Could not remove the custom track.');
    } finally {
      setBusyId(null);
    }
  }, []);

  const onToggleIgnore = useCallback(async (app: LibApp) => {
    const key = String(app.appid);
    const next = !ignoredRef.current[key];
    if (!await setAppIgnored(app.appid, next)) {
      setError('Could not update ignore state.');
      return;
    }
    setIgnoredMap((map) => ({ ...map, [key]: next }));
  }, []);

  const visible = useMemo(() => {
    const pool = apps ?? [];
    const filtered = showAll ? pool : pool.filter((app) => (app.appType ?? 1) === 1);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return filtered
      .filter((app) => !normalizedQuery || app.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => Number(Boolean(customMap[String(a.appid)])) - Number(Boolean(customMap[String(b.appid)])) || a.name.localeCompare(b.name));
  }, [apps, customMap, query, showAll]);

  const shown = visible.slice(0, MAX_CARDS);
  return (
    <>
      <DialogHeader>Custom game music</DialogHeader>
      <DialogBody>
        <DialogBodyText>Choose a personal track for a game. It plays before automatic theme search.</DialogBodyText>
        <TextField label="Search games" value={query} onChange={(event) => setQuery(event.target.value)} />
        <DialogCheckbox label="Show software and tools" bottomSeparator="none" checked={showAll} onChange={setShowAll} />
        {error && <DialogBodyText>{error}</DialogBodyText>}
        <div style={LIST_SCROLL}>
          {apps === null && <DialogBodyText>Loading your library…</DialogBodyText>}
          {apps !== null && shown.length === 0 && <DialogBodyText>No games match “{query}”.</DialogBodyText>}
          {shown.map((app) => (
            <GameRow
              key={app.appid}
              app={app}
              customTitle={customMap[String(app.appid)]?.title}
              busy={busyId === app.appid}
              ignored={Boolean(ignoredMap[String(app.appid)])}
              onSet={onSet}
              onClear={onClear}
              onToggleIgnore={onToggleIgnore}
            />
          ))}
          {visible.length > MAX_CARDS && <DialogBodyText>Showing the first {MAX_CARDS} games. Use search to narrow the list.</DialogBodyText>}
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT_EXTS} hidden onChange={onFilePicked} />
      </DialogBody>
    </>
  );
};
