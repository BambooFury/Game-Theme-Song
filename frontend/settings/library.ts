import { warn } from '../core/log';
import { utf8ToBase64 } from '../core/base64';
import { setCustomMusicBegin, setCustomMusicChunk, setCustomMusicFinish } from '../core/api';
import type { LibApp, CustomMap } from '../core/types';


export const ACCEPT_EXTS = '.mp3,.m4a,.aac,.ogg,.oga,.opus,.webm,.wav,.flac,audio/*';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_CARDS = 200;

const UPLOAD_CHUNK = 512 * 1024;

export function decodeCustomItems(items: Record<string, { title?: string; name?: string }>): CustomMap {
  const out: CustomMap = {};
  for (const k in items) {
    const it = items[k] || {};
    out[k] = { title: it.title ?? '', name: it.name ?? '' };
  }
  return out;
}

function resolveCover(ov: any): string | undefined {
  const as: any = (window as any).appStore;
  for (const fn of ['GetVerticalCapsuleURLForApp', 'GetCachedVerticalCapsuleURL']) {
    try {
      const u = as && typeof as[fn] === 'function' ? as[fn].call(as, ov) : undefined;
      if (typeof u === 'string' && u && !u.endsWith('/')) return u;
    } catch (e) {}
  }
  for (const key of ['m_strVerticalCapsuleURL', 'm_strLocalCachedVerticalCapsuleURL', 'm_strSelectedLandscapeArtworkURL']) {
    const v = ov?.[key];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

export function getLibraryApps(): LibApp[] {
  const out: LibApp[] = [];
  const seen = new Set<number>();
  const push = (ov: any) => {
    if (!ov) return;
    const appid = Number(ov.appid ?? ov.m_unAppID ?? ov.nAppID ?? ov.unAppID);
    if (!appid || Number.isNaN(appid) || seen.has(appid)) return;
    const name = ov.display_name ?? ov.appname ?? ov.strDisplayName ?? ov.name ?? `App ${appid}`;
    seen.add(appid);
    out.push({ appid, name: String(name), cover: resolveCover(ov) });
  };
  try {
    const cs: any = (window as any).collectionStore;
    const cols = [cs?.allGamesCollection, cs?.GetCollection?.('all-games'), cs?.GetCollection?.('local-install')];
    for (const col of cols) {
      const apps = col?.allApps ?? col?.visibleApps;
      if (apps && typeof apps[Symbol.iterator] === 'function') for (const a of apps) push(a);
    }
  } catch (e) { warn('collectionStore read failed', e); }
  if (out.length === 0) {
    try {
      const m: any = (window as any).appStore?.m_mapApps;
      if (m && typeof m.values === 'function') for (const ov of m.values()) push(ov);
    } catch (e) { warn('appStore read failed', e); }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function uploadCustomMusic(appid: number | string, gameName: string, fileName: string, data: string): Promise<{ ok: boolean; error?: string }> {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const begin = JSON.parse(await setCustomMusicBegin({ app_id: appid }));
  if (!begin?.ok) return begin;
  for (let i = 0; i < data.length; i += UPLOAD_CHUNK) {
    const r = JSON.parse(await setCustomMusicChunk({ app_id: appid, chunk: data.slice(i, i + UPLOAD_CHUNK) }));
    if (!r?.ok) return r;
  }
  return JSON.parse(await setCustomMusicFinish({ app_id: appid, ext, title_b64: utf8ToBase64(fileName), name_b64: utf8ToBase64(gameName) }));
}
