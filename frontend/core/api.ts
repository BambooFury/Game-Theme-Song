import { ffi } from 'millennium';

// Bridge to the Lua backend. Each backend function is annotated with ---@ffi
// in backend/main.lua and is called with positional arguments. Every function
// returns the backend's JSON payload as a string; callers parse it.

export const getThemeAudio = ffi<[number | string, string, boolean], string>('get_theme_audio');
export const rerollTheme = ffi<[number | string, string, boolean, string], string>('reroll_theme');
export const invalidateAudio = ffi<[number | string], string>('invalidate_audio');
export const getBackendSettings = ffi<[], string>('get_settings');
export const setBackendSetting = ffi<[string, string | number | boolean], string>('set_setting');
export const getCacheInfo = ffi<[], string>('get_cache_info');
export const clearAudioCache = ffi<[], string>('clear_audio_cache');
export const getCacheList = ffi<[], string>('get_cache_list');
export const clearCacheFor = ffi<[number | string], string>('clear_cache_for');
export const getCustomList = ffi<[], string>('get_custom_list');
export const setCustomMusicBegin = ffi<[number | string], string>('set_custom_music_begin');
export const setCustomMusicChunk = ffi<[number | string, string], string>('set_custom_music_chunk');
export const setCustomMusicFinish = ffi<[number | string, string, string, string], string>('set_custom_music_finish');
export const clearCustomMusic = ffi<[number | string], string>('clear_custom_music');
export const getIgnoredList = ffi<[], string>('get_ignored_list');
export const setIgnoredBackend = ffi<[number | string, boolean], string>('set_ignored');
