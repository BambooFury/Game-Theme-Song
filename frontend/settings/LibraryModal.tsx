import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DialogButton, DialogButtonSecondary, DialogCheckbox, Field, TextField } from 'millennium';
import { MdCloudOff, MdDeleteOutline, MdHourglassEmpty, MdSearchOff, MdSportsEsports, MdUploadFile } from 'react-icons/md';
import { warn } from '../core/log';
import { t } from '../core/i18n';
import { readFileBase64 } from '../core/base64';
import { clearCustomMusic, getCustomList, getIgnoredList } from '../core/api';
import { reapplyForApp, setAppIgnored, getCurrentAppId, subscribeContext } from '../core/engine';
import type { CustomMap, LibApp } from '../core/types';
import { ACCEPT_EXTS, MAX_CARDS, MAX_UPLOAD_BYTES, decodeCustomItems, getLibraryApps, uploadCustomMusic } from './library';

const LIST_SCROLL: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' };

const ICON_STYLE: React.CSSProperties = { width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 };

const AppIcon: React.FC<{ app: LibApp }> = ({ app }) => {
  const src = app.icon ?? app.cover ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/capsule_236x69.jpg`;
  return <img src={src} alt="" style={ICON_STYLE} loading="lazy" onError={(e) => { (e.currentTarget.style.display = 'none'); }} />;
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; body?: string }> = ({ icon, title, body }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px 24px', textAlign: 'center' }}>
    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(103,193,245,0.1)', border: '1px solid rgba(103,193,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--main-text-color, #ffffff)' }}>{title}</div>
    {body && <div style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--secondary-text-color, rgba(255,255,255,0.5))', maxWidth: '320px' }}>{body}</div>}
  </div>
);

interface GameRowProps {
  app: LibApp;
  customTitle?: string;
  busy: boolean;
  ignored: boolean;
  current: boolean;
  onSet: (app: LibApp) => void;
  onClear: (app: LibApp) => void;
  onToggleIgnore: (app: LibApp) => void;
}

const GameRow: React.FC<GameRowProps> = ({ app, customTitle, busy, ignored, current, onSet, onClear, onToggleIgnore }) => {
  const base = customTitle
    ? t('Custom track: {title}', { title: customTitle })
    : ignored
      ? t('Automatic search is off for this game.')
      : t('Uses automatic theme search.');
  const description = current ? `${base} · ${t('currently open')}` : base;
  return (
    <Field
      label={app.name}
      description={description}
      icon={<AppIcon app={app} />}
      childrenLayout="inline"
      childrenContainerWidth="min"
    >
      <div className="gts-row-actions">
        <div title={ignored ? t('Automatic search is off') : t('Turn off automatic search')}>
          <DialogCheckbox
            bottomSeparator="none"
            checked={ignored}
            onChange={() => onToggleIgnore(app)}
          />
        </div>
        {customTitle && (
          <DialogButton
            style={{ padding: '7px', minWidth: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            disabled={busy}
            onClick={() => onClear(app)}
          >
            <MdDeleteOutline size={15} />
          </DialogButton>
        )}
        <DialogButtonSecondary
          style={{ padding: '7px 14px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          disabled={busy}
          onClick={() => onSet(app)}
        >
          {busy
            ? <span>{t('Saving…')}</span>
            : (
              <>
                <MdUploadFile size={15} />
                {customTitle ? t('Replace') : t('Set music')}
              </>
            )}
        </DialogButtonSecondary>
      </div>
    </Field>
  );
};

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
  const [currentAppId, setCurrentAppId] = useState<number | null>(getCurrentAppId());
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingApp = useRef<LibApp | null>(null);
  const customMapRef = useRef(customMap);
  const ignoredRef = useRef(ignoredMap);
  customMapRef.current = customMap;
  ignoredRef.current = ignoredMap;

  useEffect(() => subscribeContext((ctx) => setCurrentAppId(ctx.appId)), []);

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
      setError(t('“{file}” is too large (maximum 50 MB).', { file: file.name }));
      return;
    }
    setBusyId(app.appid);
    setError(null);
    try {
      const response = await uploadCustomMusic(app.appid, app.name, file.name, await readFileBase64(file));
      if (!response?.ok) {
        setError(t('Couldn’t set music: {error}.', { error: response?.error ?? 'unknown error' }));
        return;
      }
      const next = { ...customMapRef.current, [String(app.appid)]: { title: file.name.replace(/\.[^.]+$/, ''), name: app.name } };
      updateCustomMap(next);
      void reapplyForApp(app.appid);
    } catch (e) {
      warn('set custom failed', e);
      const reason = e instanceof Error ? e.message : String(e);
      setError(t('Something went wrong while saving the file: {reason}', { reason }));
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
      setError(t('Could not remove the custom track.'));
    } finally {
      setBusyId(null);
    }
  }, []);

  const onToggleIgnore = useCallback(async (app: LibApp) => {
    const key = String(app.appid);
    const next = !ignoredRef.current[key];
    if (!await setAppIgnored(app.appid, next)) {
      setError(t('Could not update ignore state.'));
      return;
    }
    setIgnoredMap((map) => ({ ...map, [key]: next }));
  }, []);

  const customCount = useMemo(() => Object.keys(customMap).length, [customMap]);

  const visible = useMemo(() => {
    const pool = apps ?? [];
    const filtered = showAll ? pool : pool.filter((app) => (app.appType ?? 1) === 1);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return filtered
      .filter((app) => !normalizedQuery || app.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (a.appid === currentAppId) return -1;
        if (b.appid === currentAppId) return 1;
        return Number(Boolean(customMap[String(b.appid)])) - Number(Boolean(customMap[String(a.appid)])) || a.name.localeCompare(b.name);
      });
  }, [apps, customMap, query, showAll, currentAppId]);

  const shown = visible.slice(0, MAX_CARDS);
  const isSearching = query.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '16px 16px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--main-text-color, #ffffff)' }}>{t('Custom game music')}</span>
          {customCount > 0 && <span className="gts-tab-count">{customCount}</span>}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--secondary-text-color, rgba(255,255,255,0.5))' }}>{t('Pick a personal track that plays before automatic search.')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 16px 8px', gap: '4px', flexShrink: 0 }}>
        <TextField label={t("Search games")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <DialogCheckbox label={t("Show software and tools")} bottomSeparator="none" checked={showAll} onChange={setShowAll} />
        {error && (
          <div style={{ fontSize: '12px', color: '#e05252', padding: '4px 2px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MdCloudOff size={14} />
            {error}
          </div>
        )}
      </div>

      <div style={LIST_SCROLL}>
        {apps === null ? (
          <EmptyState icon={<MdHourglassEmpty size={28} style={{ color: '#67c1f5', opacity: 0.7 }} />} title={t("Loading your library")} body={t("Reading your installed games and custom tracks…")} />
        ) : shown.length === 0 ? (
          isSearching ? (
            <EmptyState icon={<MdSearchOff size={28} style={{ color: '#67c1f5', opacity: 0.7 }} />} title={t('No games match “{query}”', { query: query.trim() })} body="Try a different name, or turn on software and tools." />
          ) : (
            <EmptyState icon={<MdSportsEsports size={28} style={{ color: '#67c1f5', opacity: 0.7 }} />} title={t("No games to show")} body={t("Install a game, or turn on software and tools to see more.")} />
          )
        ) : (
          shown.map((app) => (
            <GameRow
              key={app.appid}
              app={app}
              customTitle={customMap[String(app.appid)]?.title}
              busy={busyId === app.appid}
              ignored={Boolean(ignoredMap[String(app.appid)])}
              current={app.appid === currentAppId}
              onSet={onSet}
              onClear={onClear}
              onToggleIgnore={onToggleIgnore}
            />
          ))
        )}
        {visible.length > MAX_CARDS && (
          <div style={{ fontSize: '12px', color: 'var(--secondary-text-color, rgba(255,255,255,0.5))', padding: '10px 16px', textAlign: 'center' }}>
            Showing the first {MAX_CARDS} games. Use search to narrow the list.
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept={ACCEPT_EXTS} hidden onChange={onFilePicked} />
    </div>
  );
};
