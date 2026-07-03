import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { ModalRoot, DialogHeader, DialogBody, TextField, showModal } from '@steambrew/client';
import { SETTINGS_CSS, SETTINGS_ICONS } from '../_assets.generated';
import { warn } from '../core/log';
import { readFileBase64 } from '../core/base64';
import { getCustomList, clearCustomMusic, getIgnoredList } from '../core/api';
import { reapplyForApp, setGlobalCustomCount, setAppIgnored } from '../core/engine';
import type { LibApp, CustomMap } from '../core/types';
import { ACCEPT_EXTS, MAX_UPLOAD_BYTES, MAX_CARDS, decodeCustomItems, getLibraryApps, uploadCustomMusic } from './library';

const TRASH_HTML = { __html: SETTINGS_ICONS.trash };
const IGNORE_HTML = { __html: SETTINGS_ICONS.mute };
const SUB_STYLE: React.CSSProperties = { margin: '0 0 10px', color: 'rgba(255,255,255,0.55)', fontSize: '12px' };
const ERROR_STYLE: React.CSSProperties = { color: '#ff8175', textAlign: 'center', padding: '8px 0', fontSize: '12px' };
const GRID_STYLE: React.CSSProperties = { height: '440px', overflowY: 'auto', padding: '10px 0' };
const HIDDEN_STYLE: React.CSSProperties = { display: 'none' };

function coverCandidates(app: LibApp): string[] {
	const appid = app.appid;
	const list: string[] = [];
	if (app.cover) list.push(app.cover);
	list.push(
		'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/library_600x900.jpg',
		'https://steamcdn-a.akamaihd.net/steam/apps/' + appid + '/library_600x900.jpg',
		'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/capsule_616x353.jpg',
		'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/header.jpg',
		'https://steamcdn-a.akamaihd.net/steam/apps/' + appid + '/header.jpg',
	);
	return list;
}

interface GameCardProps {
	key?: React.Key;
	app: LibApp;
	customTitle?: string;
	busy: boolean;
	ignored: boolean;
	onSet: (app: LibApp) => void;
	onClear: (app: LibApp) => void;
	onToggleIgnore: (app: LibApp) => void;
}

const GameCard = memo(function GameCard({ app, customTitle, busy, ignored, onSet, onClear, onToggleIgnore }: GameCardProps) {
	const urls = useMemo(() => coverCandidates(app), [app.appid, app.cover]);
	const [idx, setIdx] = useState(0);
	const failed = idx >= urls.length;
	const hasCustom = customTitle !== undefined;
	return (
		<div className={'gts-lib-card' + (hasCustom ? ' gts-has-custom' : '') + (ignored ? ' gts-ignored' : '')}>
			<div className="gts-lib-cover-wrap">
				{failed
					? <div className="gts-lib-fallback">{app.name}</div>
					: <img className="gts-lib-cover" src={urls[idx]} alt="" loading="lazy" decoding="async" onError={() => setIdx((i) => i + 1)} />}
				{hasCustom && <span className="gts-lib-badge">♪ Custom</span>}
				<button
	type="button"
	className={'gts-lib-ignore' + (ignored ? ' gts-on' : '')}
	onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); onToggleIgnore(app); }}
	dangerouslySetInnerHTML={IGNORE_HTML}
/>
			</div>
			<div className="gts-lib-card-body">
				<div className="gts-lib-card-name">{app.name}</div>
				<div className="gts-lib-card-actions">
					<button className="gts-lib-mini gts-primary" disabled={busy} onClick={() => onSet(app)}>
						{busy ? 'Saving\u2026' : hasCustom ? 'Replace' : 'Set music'}
					</button>
					{hasCustom && <button className="gts-lib-mini gts-danger" disabled={busy} onClick={() => onClear(app)} dangerouslySetInnerHTML={TRASH_HTML} />}
				</div>
			</div>
		</div>
	);
});

interface LibraryModalProps {
	closeModal?: () => void;
	onChanged: (map: CustomMap) => void;
}

const LibraryModal: React.FC<LibraryModalProps> = ({ closeModal, onChanged }) => {
	const [apps, setApps] = useState<LibApp[] | null>(null);
	const [customMap, setCustomMap] = useState<CustomMap>({});
	const [ignoredMap, setIgnoredMap] = useState<Record<string, boolean>>({});
	const [query, setQuery] = useState('');
	const [busyId, setBusyId] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement | null>(null);
	const pendingApp = useRef<LibApp | null>(null);
	const pickingRef = useRef(false);

	const close = () => { if (!pickingRef.current) closeModal?.(); };

	useEffect(() => {
		setApps(getLibraryApps());
		(async () => {
			try {
				const raw = await getCustomList();
				const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
				if (info?.ok && info.items) setCustomMap(decodeCustomItems(info.items));
			} catch (e) { warn('getCustomList failed', e); }
			try {
				const rawIgn = await getIgnoredList();
				const ign = typeof rawIgn === 'string' ? JSON.parse(rawIgn) : rawIgn;
				if (ign?.ok && ign.items) setIgnoredMap({ ...ign.items });
			} catch (e) { warn('getIgnoredList failed', e); }
		})();
	}, []);

	const customMapRef = useRef(customMap);
	customMapRef.current = customMap;
	const ignoredRef = useRef(ignoredMap);
	ignoredRef.current = ignoredMap;

	const commit = (map: CustomMap) => { setCustomMap(map); onChanged(map); };

	const onSet = useCallback((app: LibApp) => {
		setError(null);
		pendingApp.current = app;
		pickingRef.current = true;
		const onFocus = () => {
			window.removeEventListener('focus', onFocus);
			setTimeout(() => { pickingRef.current = false; }, 500);
		};
		window.addEventListener('focus', onFocus);
		fileRef.current?.click();
	}, []);

	const onFilePicked = async (ev: React.ChangeEvent<HTMLInputElement>) => {
		pickingRef.current = false;
		const file = ev.target.files?.[0];
		ev.target.value = '';
		const app = pendingApp.current;
		pendingApp.current = null;
		if (!file || !app) return;
		if (file.size > MAX_UPLOAD_BYTES) { setError('"' + file.name + '" is too large (max 50 MB).'); return; }
		setBusyId(app.appid);
		setError(null);
		try {
			const data = await readFileBase64(file);
			const resp = await uploadCustomMusic(app.appid, app.name, file.name, data);
			if (!resp?.ok) { setError("Couldn't set music: " + (resp?.error ?? 'unknown error') + '.'); return; }
			const nextMap = { ...customMapRef.current };
			nextMap[String(app.appid)] = { title: file.name.replace(/\.[^.]+$/, ''), name: app.name };
			commit(nextMap);
			void reapplyForApp(app.appid);
		} catch (e) {
			warn('set custom failed', e);
			const detail = e instanceof Error && e.message ? ': ' + e.message : '';
			setError('Something went wrong while saving the file' + detail + '.');
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

	const onToggleIgnore = useCallback(async (app: LibApp) => {
		const key = String(app.appid);
		const next = !ignoredRef.current[key];
		const ok = await setAppIgnored(app.appid, next);
		if (!ok) { setError('Could not update ignore state.'); return; }
		setIgnoredMap((m) => ({ ...m, [key]: next }));
	}, []);

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

	const subText = customCount > 0
		? customCount + ' ' + (customCount === 1 ? 'game uses' : 'games use') + ' your own track'
		: 'Pick your own theme for any game \u2014 it always plays before the auto search.';

	return (
		<ModalRoot closeModal={close} onCancel={close} onEscKeypress={close}>
			<style>{SETTINGS_CSS}</style>
			<DialogHeader>Custom game music</DialogHeader>
			<DialogBody>
				<div style={SUB_STYLE}>{subText}</div>
				<TextField label="Search" value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} />
				{error && <div style={ERROR_STYLE}>{error}</div>}
				<div style={GRID_STYLE} className="gts-lib-grid">
					{apps === null && <div className="gts-lib-loading">Loading your library…</div>}
					{apps !== null && shown.length === 0 && <div className="gts-lib-empty">No games match “{query}”.</div>}
					{shown.map((app) => (
						<GameCard
							key={app.appid}
							app={app}
							customTitle={customMap[String(app.appid)]?.title}
							busy={busyId === app.appid}
							ignored={!!ignoredMap[String(app.appid)]}
							onSet={onSet}
							onClear={onClear}
							onToggleIgnore={onToggleIgnore}
						/>
					))}
				</div>
				<div className="gts-lib-foot">
					{visible.length > MAX_CARDS
						? <>Showing first <b>{MAX_CARDS}</b> of {visible.length} — use search to narrow down.</>
						: <>Supported formats: <b>MP3, M4A, AAC, OGG, OPUS, WAV, FLAC</b> — up to <b>50 MB</b> per file.</>}
				</div>
				<input ref={fileRef} type="file" accept={ACCEPT_EXTS} style={HIDDEN_STYLE} onChange={onFilePicked} />
			</DialogBody>
		</ModalRoot>
	);
};

export function openLibraryWindow(): void {
	let handle: ReturnType<typeof showModal> | null = null;
	handle = showModal(
		<LibraryModal onChanged={(map) => setGlobalCustomCount(Object.keys(map).length)} />,
		window,
		{
			strTitle: 'Custom game music',
			bNeverPopOut: true,
			popupWidth: 920,
			popupHeight: 680,
		},
	);
	void handle;
}
