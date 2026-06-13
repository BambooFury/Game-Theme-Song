export type Primitive = string | number | boolean;
export type NoArgs = [];

export interface Settings {
  enabled: boolean;
  volume: number;
  fade_seconds: number;
  search_suffix: string;
  loop: boolean;
  max_seconds: number;
  stop_on_launch: boolean;
  manual_search: boolean;
}

export interface CacheInfo {
  count: number;
  bytes: number;
}

export interface LibApp {
  appid: number;
  name: string;
}

export type CustomMap = Record<string, { title?: string; name?: string }>;

export interface CacheItem {
  appid: number;
  name: string;
  title: string;
  bytes: number;
}
