import russian from './languages/russian/russian.json';

const TABLE: Record<string, Record<string, string>> = { russian };

const LANG = (() => {
  try {
    return (new URLSearchParams(window.location.search).get('LANGUAGE') ?? 'english').toLowerCase();
  } catch {
    return 'english';
  }
})();

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = TABLE[LANG]?.[s] ?? s;
  if (vars) {
    for (const k in vars) out = out.replace(`{${k}}`, String(vars[k]));
  }
  return out;
}
