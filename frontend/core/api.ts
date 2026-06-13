import { callable } from '@steambrew/client';
import type { Primitive, NoArgs } from './types';

export const getThemeAudio = callable<[{ app_id: number | string; game_name: string; force_refresh: boolean }], string>('get_theme_audio');
export const invalidateAudio = callable<[{ app_id: number | string }], string>('invalidate_audio');
export const getBackendSettings = callable<NoArgs, string>('get_settings');
export const setBackendSetting = callable<[{ key: string; value: Primitive }], string>('set_setting');
export const logFrontend = callable<[{ message: string }], string>('log_frontend');
export const getCacheInfo = callable<NoArgs, string>('get_cache_info');
export const clearAudioCache = callable<NoArgs, string>('clear_audio_cache');
export const getCacheList = callable<NoArgs, string>('get_cache_list');
export const clearCacheFor = callable<[{ app_id: number | string }], string>('clear_cache_for');
export const getCustomList = callable<NoArgs, string>('get_custom_list');
export const setCustomMusicBegin = callable<[{ app_id: number | string }], string>('set_custom_music_begin');
export const setCustomMusicChunk = callable<[{ app_id: number | string; chunk: string }], string>('set_custom_music_chunk');
export const setCustomMusicFinish = callable<[{ app_id: number | string; ext: string; title_b64: string; name_b64: string }], string>('set_custom_music_finish');
export const clearCustomMusic = callable<[{ app_id: number | string }], string>('clear_custom_music');
