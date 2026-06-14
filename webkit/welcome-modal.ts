import {
  WELCOME_ICONS as ico,
  WELCOME_CSS_TEMPLATE as WELCOME_CSS,
  WELCOME_HTML_TEMPLATE,
} from './_assets.generated';

const SEEN_FLAG = 'gts_welcomed_v3';

function alreadySeen(): boolean {
  try { return localStorage.getItem(SEEN_FLAG) === '1'; }
  catch { return true; }
}

function markSeen() {
  try { localStorage.setItem(SEEN_FLAG, '1'); } catch {}
}

export function showWelcomeIfFirstTime(): void {
  if (alreadySeen()) return;
  let tries = 0;
  const tryMount = () => {
    if (tries++ > 60) return;
    if (!document.body) {
      setTimeout(tryMount, 250);
      return;
    }
    if (document.getElementById('gts-welcome-host')) return;
    build();
  };
  setTimeout(tryMount, 1500);
}

function dismiss(root: HTMLDivElement, dlg: HTMLDivElement, dim: HTMLDivElement) {
  markSeen();
  dlg.style.animation = 'gts-welcome-out 0.18s ease-in forwards';
  dim.style.animation = 'gts-welcome-fade-out 0.18s ease-in forwards';
  setTimeout(() => { try { root.remove(); } catch (_e) {} }, 220);
}

function build() {
  const root = document.createElement('div');
  root.id = 'gts-welcome-host';
  root.style.cssText = "all:initial;font-family:'Motiva Sans','Segoe UI',Arial,sans-serif";

  const styleEl = document.createElement('style');
  styleEl.textContent = WELCOME_CSS;
  root.appendChild(styleEl);

  const dim = document.createElement('div');
  dim.className = 'gts-welcome-dim';

  const dlg = document.createElement('div');
  dlg.className = 'gts-welcome-dlg';
  dlg.innerHTML = WELCOME_HTML_TEMPLATE
    .replace(/\{\{ICON_X\}\}/g,        ico.x)
    .replace(/\{\{ICON_MUSIC\}\}/g,    ico.music)
    .replace(/\{\{ICON_SEARCH\}\}/g,   ico.search)
    .replace(/\{\{ICON_SPARKLES\}\}/g, ico.sparkles)
    .replace(/\{\{ICON_ZAP\}\}/g,      ico.zap)
    .replace(/\{\{ICON_SETTINGS\}\}/g, ico.settings)
    .replace(/\{\{ICON_LIBRARY\}\}/g,  ico.library)
    .replace(/\{\{ICON_PLAY\}\}/g,     ico.play);

  dim.appendChild(dlg);
  root.appendChild(dim);
  document.body.appendChild(root);

  function bye() {
    window.removeEventListener('keydown', escHandler);
    dismiss(root, dlg, dim);
  }

  const cta  = dlg.querySelector<HTMLButtonElement>('#gts-welcome-cta');
  const xBtn = dlg.querySelector<HTMLButtonElement>('#gts-welcome-x');
  if (cta)  cta.addEventListener('click', bye);
  if (xBtn) xBtn.addEventListener('click', bye);

  function escHandler(ev: KeyboardEvent) {
    if (ev.key !== 'Escape') return;
    bye();
  }
  window.addEventListener('keydown', escHandler);
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('keydown', escHandler);
  }, { once: true });
}
