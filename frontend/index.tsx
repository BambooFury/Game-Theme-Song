import { IconsModule, definePlugin, SliderField, callable } from '@steambrew/client';

import React, { useEffect, useState } from 'react';



type Primitive = string | number | boolean;



const getThemeAudio = callable<

	[{ app_id: number | string; game_name: string; force_refresh: boolean }],

	string

>('get_theme_audio');

const invalidateAudio = callable<[{ app_id: number | string }], string>('invalidate_audio');

const getBackendSettings = callable<[], string>('get_settings');

const setBackendSetting = callable<[{ key: string; value: Primitive }], string>('set_setting');



interface Settings {

	enabled: boolean;

	volume: number;

	fade_seconds: number;

	search_suffix: string;

}



const DEFAULTS: Settings = {

	enabled: true,

	volume: 0.35,

	fade_seconds: 1.5,

	search_suffix: ' theme song',

};



const state: { settings: Settings } = { settings: { ...DEFAULTS } };



let audioEl: HTMLAudioElement | null = null;

let fadeTimer: ReturnType<typeof setInterval> | null = null;

let currentAppId: number | null = null;

let resolveSeq = 0;



interface ResolvedAudio {

	url: string;

	proxy_url?: string | null;

	title?: string;

	ts: number;

}

const RESOLVED_TTL_MS = 30 * 60 * 1000;

const RESOLVE_COOLDOWN_MS = 10 * 1000;

const LS_KEY = 'gts:resolvedCache:v1';

const resolvedCache = new Map<number, ResolvedAudio>();

const inFlight = new Map<number, Promise<ResolvedAudio | null>>();

const lastResolveAttempt = new Map<number, number>();



(function loadCacheFromStorage() {

	try {

		const raw = window.localStorage?.getItem(LS_KEY);

		if (!raw) return;

		const obj = JSON.parse(raw) as Record<string, ResolvedAudio>;

		const now = Date.now();

		for (const [k, v] of Object.entries(obj)) {

			if (v && typeof v.url === 'string' && typeof v.ts === 'number' && now - v.ts < RESOLVED_TTL_MS) {

				resolvedCache.set(parseInt(k, 10), v);

			}

		}

	} catch {}

})();



let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistCache() {

	if (persistTimer) return;

	persistTimer = setTimeout(() => {

		persistTimer = null;

		try {

			const obj: Record<string, ResolvedAudio> = {};

			for (const [k, v] of resolvedCache) obj[k] = v;

			window.localStorage?.setItem(LS_KEY, JSON.stringify(obj));

		} catch {}

	}, 500);

}



const warn = (...a: unknown[]) => console.warn('[GameThemeSong]', ...a);



function ensureAudio(): HTMLAudioElement {

	if (audioEl && document.body.contains(audioEl)) return audioEl;

	const a = document.createElement('audio');

	a.id = 'game-theme-song-audio';

	a.preload = 'none';

	a.loop = true;

	a.style.display = 'none';

	document.body.appendChild(a);

	audioEl = a;

	return a;

}



function clearFade() {

	if (fadeTimer) {

		clearInterval(fadeTimer);

		fadeTimer = null;

	}

}



function fadeTo(target: number, durationSec: number, onComplete?: () => void) {

	const a = ensureAudio();

	clearFade();

	const start = a.volume;

	const ticks = Math.max(1, Math.floor(durationSec * 30));

	let i = 0;

	fadeTimer = setInterval(() => {

		i += 1;

		const t = i / ticks;

		a.volume = Math.max(0, Math.min(1, start + (target - start) * t));

		if (i >= ticks) {

			clearFade();

			onComplete?.();

		}

	}, (durationSec * 1000) / ticks);

}



function stopAudio() {

	if (currentAppId === null && (!audioEl || audioEl.paused)) return;

	currentAppId = null;

	if (!audioEl) return;

	fadeTo(0, state.settings.fade_seconds, () => audioEl?.pause());

}



async function resolveGameName(appId: number): Promise<string | null> {

	const tryOnce = (): string | null => {

		try {

			const overview = (window as any).appStore?.GetAppOverviewByAppID?.(appId);

			if (overview) return overview.display_name ?? overview.appname ?? null;

		} catch {}

		try {

			const a = (window as any).collectionStore?.GetAppDetailsForAppID?.(appId);

			if (a?.strDisplayName) return a.strDisplayName;

		} catch {}

		return null;

	};



	let name = tryOnce();

	if (name) return name;



	for (let i = 0; i < 10 && !name; i++) {

		await new Promise((r) => setTimeout(r, 150));

		name = tryOnce();

	}

	return name;

}



async function resolveAudioFor(appId: number, name: string, forceRefresh: boolean): Promise<ResolvedAudio | null> {

	if (!forceRefresh) {

		const cached = resolvedCache.get(appId);

		if (cached && Date.now() - cached.ts < RESOLVED_TTL_MS) return cached;

		const existing = inFlight.get(appId);

		if (existing) return existing;

		const lastAttempt = lastResolveAttempt.get(appId) ?? 0;

		if (Date.now() - lastAttempt < RESOLVE_COOLDOWN_MS) return null;

	}



	lastResolveAttempt.set(appId, Date.now());



	const p = (async (): Promise<ResolvedAudio | null> => {

		try {

			const raw = await getThemeAudio({ app_id: appId, game_name: name, force_refresh: forceRefresh });

			const resp = typeof raw === 'string' ? JSON.parse(raw) : raw;

			if (!resp?.ok || !resp.url) {

				warn('no audio for', name, resp?.error);

				return null;

			}

			const info: ResolvedAudio = {

				url: resp.url,

				proxy_url: resp.proxy_url,

				title: resp.title,

				ts: Date.now(),

			};

			resolvedCache.set(appId, info);

			persistCache();

			return info;

		} catch (e) {

			warn('backend error', e);

			return null;

		}

	})();



	inFlight.set(appId, p);

	try {

		return await p;

	} finally {

		inFlight.delete(appId);

	}

}



async function playForApp(appId: number) {

	if (!state.settings.enabled) return;

	if (currentAppId === appId && audioEl && !audioEl.paused) return;



	currentAppId = appId;

	const mySeq = ++resolveSeq;



	const name = await resolveGameName(appId);

	if (mySeq !== resolveSeq) return;

	if (!name) {

		warn('could not resolve game name for app', appId);

		return;

	}



	const info = await resolveAudioFor(appId, name, false);

	if (mySeq !== resolveSeq) return;

	if (!info) return;



	await playWithFallback(appId, name, info, mySeq);

}



async function playWithFallback(

	appId: number,

	name: string,

	info: ResolvedAudio,

	mySeq: number,

) {

	await playUrl(info.url, async (reason) => {

		warn('primary url failed:', reason);

		if (info.proxy_url && mySeq === resolveSeq) {

			warn('falling back to proxy url');

			await playUrl(info.proxy_url, async (reason2) => {

				warn('proxy url failed:', reason2);

				resolvedCache.delete(appId);

				try {

					await invalidateAudio({ app_id: appId });

				} catch (e) {

					warn('invalidate failed', e);

				}

				const fresh = await resolveAudioFor(appId, name, true);

				if (mySeq !== resolveSeq || !fresh) return;

				await playUrl(fresh.url);

			});

		}

	});

}



async function playUrl(url: string, onError?: (reason: string) => void) {

	const a = ensureAudio();

	if (a.src !== url) {

		a.src = url;

		a.load();

	}

	a.volume = 0;

	a.onerror = () => {

		const me = a.error;

		const reason = me ? `code=${me.code} msg=${me.message || '?'}` : 'unknown audio error';

		warn('audio.onerror', reason, 'src=', a.currentSrc);

		onError?.(reason);

	};

	try {

		await a.play();

		fadeTo(state.settings.volume, state.settings.fade_seconds);

	} catch (e: any) {

		const reason = `play() rejected: ${e?.name || ''} ${e?.message || String(e)}`;

		warn(reason, 'src=', a.currentSrc);

		onError?.(reason);

	}

}



const POLL_MS = 500;

let pollTimer: ReturnType<typeof setInterval> | null = null;



function detectAppId(): number | null {

	try {

		const wins: any[] =

			(globalThis as any).SteamUIStore?.WindowStore?.SteamUIWindows ?? [];

		for (const w of wins) {

			const params = w?.m_params;

			if (params && typeof params === 'object') {

				const appid = params.appid ?? params.appId ?? params.AppID;

				if (appid && /^\d+$/.test(String(appid))) {

					return parseInt(String(appid), 10);

				}

			}

			const path =

				(typeof w?.m_locationPathname === 'string' && w.m_locationPathname) ||

				w?.m_history?.location?.pathname ||

				'';

			const m = path.match(/\/library\/app\/(\d+)/);

			if (m) return parseInt(m[1], 10);

		}

	} catch (e) {

		warn('detectAppId via SteamUIStore failed', e);

	}

	return null;

}



const NAV_DEBOUNCE_MS = 1000;

let navDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let lastDetectedAppId: number | null = null;



function pollOnce() {

	let id: number | null = null;

	try {

		id = detectAppId();

	} catch (e) {

		warn('detectAppId failed', e);

		return;

	}

	if (id === currentAppId) return;

	if (id === lastDetectedAppId && navDebounceTimer) return;

	lastDetectedAppId = id;

	if (navDebounceTimer) clearTimeout(navDebounceTimer);

	navDebounceTimer = setTimeout(() => {

		navDebounceTimer = null;

		const finalId = detectAppId();

		if (finalId === currentAppId) return;

		if (finalId === null) {

			stopAudio();

		} else {

			void playForApp(finalId);

		}

	}, NAV_DEBOUNCE_MS);

}



function startPolling() {

	if (pollTimer) return;

	pollTimer = setInterval(pollOnce, POLL_MS);

	setTimeout(pollOnce, 100);

}



const SettingsContent: React.FC = () => {

	const [percent, setPercent] = useState(Math.round(state.settings.volume * 100));



	useEffect(() => {

		(async () => {

			try {

				const raw = await getBackendSettings();

				const s = typeof raw === 'string' ? JSON.parse(raw) : raw;

				if (s && typeof s === 'object') {

					state.settings = { ...state.settings, ...s };

					setPercent(Math.round(state.settings.volume * 100));

				}

			} catch (e) {

				warn('failed to load settings', e);

			}

		})();

	}, []);



	const onSlider = (p: number) => {

		const clampedPercent = Math.max(0, Math.min(100, Math.round(p)));

		const volume = clampedPercent / 100;

		setPercent(clampedPercent);

		state.settings.volume = volume;

		void setBackendSetting({ key: 'volume', value: volume }).catch((e) =>

			warn('failed to save volume', e),

		);

		if (audioEl && !audioEl.paused) audioEl.volume = volume;

	};



	return (

		<SliderField

			label="Music volume"

			description={`Background theme music is playing at ${percent}%.`}

			min={0}

			max={100}

			step={1}

			value={percent}

			showValue

			valueSuffix="%"

			notchCount={5}

			notchLabels={[

				{ notchIndex: 0, label: '0%', value: 0 },

				{ notchIndex: 1, label: '25%', value: 25 },

				{ notchIndex: 2, label: '50%', value: 50 },

				{ notchIndex: 3, label: '75%', value: 75 },

				{ notchIndex: 4, label: '100%', value: 100 },

			]}

			notchTicksVisible

			onChange={onSlider}

		/>

	);

};



export default definePlugin(() => {

	(async () => {

		try {

			const raw = await getBackendSettings();

			const s = typeof raw === 'string' ? JSON.parse(raw) : raw;

			if (s && typeof s === 'object') {

				state.settings = { ...state.settings, ...s };

			}

		} catch (e) {

			warn('failed to fetch settings', e);

		}

	})();



	startPolling();



	return {

		title: 'Game Theme Song',

		icon: <IconsModule.Music />,

		content: <SettingsContent />,

	};

});

