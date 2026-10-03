import french from './languages/french/french.json';
import german from './languages/german/german.json';
import italian from './languages/italian/italian.json';
import polish from './languages/polish/polish.json';
import spanish from './languages/spanish/spanish.json';
import latam from './languages/latam/latam.json';
import schinese from './languages/schinese/schinese.json';
import japanese from './languages/japanese/japanese.json';
import ukrainian from './languages/ukrainian/ukrainian.json';
import russian from './languages/russian/russian.json';

const TABLE: Record<string, Record<string, string>> = {
  french,
  german,
  italian,
  polish,
  spanish,
  latam,
  schinese,
  japanese,
  ukrainian,
  russian,
};

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
