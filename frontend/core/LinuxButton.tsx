import { findModule } from 'millennium';
import { openManagerPopup } from '../settings/managerPopups';

const MAIN_WINDOW_NAME = 'SP Desktop_uid0';
const MUSIC_BTN_CLASS = 'gts-music-btn';
const POLL_MS = 500;
const SETUP_TIMEOUT_MS = 120000;

const NOTE_ICON =
  '<svg class="SVGIcon_Settings" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:20px;height:20px;display:block"><path d="M18.622 3.217A1 1 0 0 1 19 4v11.667q0 .06-.007.121q.007.105.007.212a3 3 0 1 1-2-2.83V9.26l-8 1.867v6.876a3 3 0 1 1-2-2.832V6.333a1 1 0 0 1 .773-.974l10-2.333a1 1 0 0 1 .842.186z" fill="currentColor"/></svg>';

let inPageClass = '';
let btnContClass = '';
let menuBtnClass = '';
let dotClass = '';
let active = false;
let mainDoc: Document | null = null;
let watchedBrowser: unknown = null;
let watchdog: ReturnType<typeof setInterval> | null = null;

function resolveClasses() {
  if (!inPageClass) {
    try { inPageClass = findModule((e: any) => e.InPage)?.InPage ?? ''; } catch {}
  }
  if (!btnContClass) {
    try { btnContClass = findModule((e: any) => e.AppButtonsContainer)?.AppButtonsContainer ?? ''; } catch {}
  }
  if (!menuBtnClass) {
    try { menuBtnClass = findModule((e: any) => e.AppButtonsContainer && e.MenuButton)?.MenuButton ?? ''; } catch {}
  }
  if (!dotClass) {
    try { dotClass = findModule((e: any) => e.AppButtonsContainer && e.DotDotDot)?.DotDotDot ?? ''; } catch {}
  }
}

function findMusicButton(doc: Document): Element | null {
  return doc.querySelector(`.${MUSIC_BTN_CLASS}`);
}

function injectButton(doc: Document): void {
  resolveClasses();
  if (!inPageClass || !btnContClass || !menuBtnClass || !dotClass) return;
  if (findMusicButton(doc)) return;

  const host = doc.querySelector(`div.${inPageClass} div.${btnContClass}`) as HTMLElement | null;
  if (!host) return;

  const btn = doc.createElement('div');
  btn.className = `${menuBtnClass} ${MUSIC_BTN_CLASS}`;
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.title = 'Game Theme Song';
  const inner = doc.createElement('div');
  inner.className = dotClass;
  inner.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%';
  inner.innerHTML = NOTE_ICON;
  btn.appendChild(inner);
  host.insertBefore(btn, host.firstChild);
  btn.addEventListener('click', () => {
    openManagerPopup('main');
  });
}

function renderApp(): void {
  if (!mainDoc) return;
  try {
    injectButton(mainDoc);
  } catch {}
}

function boot(): void {
  let attempts = 0;
  const tick = () => {
    if (!active || !mainDoc) return;
    renderApp();
    if (findMusicButton(mainDoc)) return;
    if (attempts++ * POLL_MS < SETUP_TIMEOUT_MS) setTimeout(tick, POLL_MS);
  };
  tick();
}

function watchRequests(): void {
  const trySetup = () => {
    if (!active) return;
    const mwbm = (window as any).MainWindowBrowserManager;
    const browser = mwbm?.m_browser;
    if (!browser?.on) {
      setTimeout(trySetup, POLL_MS);
      return;
    }
    if (watchedBrowser === browser) return;
    watchedBrowser = browser;
    browser.on('finished-request', () => {
      if (mwbm.m_lastLocation?.pathname?.startsWith('/library/app/')) renderApp();
    });
  };
  trySetup();
}

function setupMainWindow(popup: any): void {
  const doc = popup?.m_popup?.document as Document | undefined;
  if (!doc?.body) return;
  mainDoc = doc;
  boot();
  watchRequests();
  watchdog = setInterval(() => {
    if (active && mainDoc) renderApp();
  }, POLL_MS * 2);
}

export function setupLinuxButtonFallback(): void {
  if (active) return;
  if (!/linux/i.test(navigator.userAgent)) return;
  active = true;

  const trySetup = (attempt: number): void => {
    if (!active) return;
    const popupManager = (window as any).g_PopupManager;
    if (!popupManager) {
      if (attempt * POLL_MS < SETUP_TIMEOUT_MS) setTimeout(() => trySetup(attempt + 1), POLL_MS);
      return;
    }
    popupManager.AddPopupCreatedCallback?.((popup: any) => {
      if (popup?.m_strName === MAIN_WINDOW_NAME) setupMainWindow(popup);
    });
    const main = popupManager.GetExistingPopup?.(MAIN_WINDOW_NAME);
    if (main?.m_popup?.document) {
      setupMainWindow(main);
    } else if (attempt * POLL_MS < SETUP_TIMEOUT_MS) {
      setTimeout(() => trySetup(attempt + 1), POLL_MS);
    }
  };
  trySetup(0);
}

export function removeLinuxButtonFallback(): void {
  active = false;
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
  watchedBrowser = null;
  mainDoc?.querySelector(`.${MUSIC_BTN_CLASS}`)?.remove();
  mainDoc = null;
}
