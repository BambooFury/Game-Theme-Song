import { findModule } from 'millennium';
import { openManagerPopup } from '../settings/managerPopups';

const MAIN_WINDOW_NAME = 'SP Desktop_uid0';
const MUSIC_BTN_CLASS = 'gts-music-btn';
const NOW_PLAYING_CLASS = 'gts-now-playing';
const POLL_MS = 500;
const FIND_TIMEOUT_MS = 4000;
const SETUP_TIMEOUT_MS = 120000;
const ICON_SVG = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><svg class="SVGIcon_Settings" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:1.2em;height:1.2em;"><path d="M18.622 3.217A1 1 0 0 1 19 4v11.667q0 .06-.007.121q.007.105.007.212a3 3 0 1 1-2-2.83V9.26l-8 1.867v6.876a3 3 0 1 1-2-2.832V6.333a1 1 0 0 1 .773-.974l10-2.333a1 1 0 0 1 .842.186z" fill="currentColor"/></svg></div>';

let inPageClass = '';
let btnContClass = '';
let menuBtnClass = '';
let topCapsuleClass = '';
let active = false;
let mainDoc: Document | null = null;
let capsuleObserver: MutationObserver | null = null;
let bootRunning = false;
let watchedBrowser: unknown = null;

function resolveClasses() {
  if (!inPageClass) {
    try { inPageClass = findModule((e: any) => e.InPage)?.InPage ?? ''; } catch {}
  }
  if (!btnContClass) {
    try { btnContClass = findModule((e: any) => e.AppButtonsContainer)?.AppButtonsContainer ?? ''; } catch {}
  }
  if (!menuBtnClass) {
    try { menuBtnClass = findModule((e: any) => e.MenuButtonContainer)?.MenuButtonContainer ?? ''; } catch {}
  }
  if (!topCapsuleClass) {
    try { topCapsuleClass = findModule((e: any) => e.TopCapsule)?.TopCapsule ?? ''; } catch {}
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findMusicButton(doc: Document): Element | null {
  return doc.querySelector(`.${MUSIC_BTN_CLASS}`);
}

async function waitForSelector(doc: Document, selector: string, timeoutMs: number): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const el = doc.querySelector(selector);
      if (el) return el;
    } catch {}
    if (!active) return null;
    await sleep(POLL_MS);
  }
  return null;
}

async function injectButton(doc: Document): Promise<void> {
  resolveClasses();
  if (!inPageClass || !btnContClass || !menuBtnClass) return;
  if (findMusicButton(doc)) return;

  const selector = `div.${inPageClass} div.${btnContClass} > div.${menuBtnClass}:not([role="button"])`;
  const target = await waitForSelector(doc, selector, FIND_TIMEOUT_MS);
  if (!target) return;
  if (findMusicButton(doc)) return;

  const parent = target.parentElement;
  if (!parent) return;

  const btn = target.cloneNode(true) as Element;
  btn.classList.add(MUSIC_BTN_CLASS);
  const firstChild = btn.firstChild as Element | null;
  if (firstChild) {
    (firstChild as HTMLElement).innerHTML = ICON_SVG;
  }
  parent.insertBefore(btn, target.nextSibling);
  btn.addEventListener('click', () => {
    openManagerPopup('main');
  });
}

function injectNowPlaying(doc: Document): void {
  if (!topCapsuleClass) return;

  const capsule = doc.querySelector(`div.${topCapsuleClass}`);
  if (capsule && !capsule.querySelector(`.${NOW_PLAYING_CLASS}`)) {
    const npDiv = doc.createElement('div');
    npDiv.className = NOW_PLAYING_CLASS;
    npDiv.style.cssText = 'position:absolute;bottom:5px;right:20px;color:white;text-shadow:0px 2px 4px rgba(0,0,0,0.8);font-weight:bold;font-size:14px;z-index:999;cursor:pointer;transition:opacity 0.3s ease,color 0.2s ease;opacity:0;pointer-events:none;';
    npDiv.onmouseover = () => { npDiv.style.color = '#67c1f5'; };
    npDiv.onmouseout = () => { npDiv.style.color = 'white'; };
    npDiv.onclick = (e) => {
      e.stopPropagation();
      const audio = document.getElementById('game-theme-song-audio') as HTMLAudioElement | null;
      if (audio && audio.src) {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      }
    };
    (capsule as HTMLElement).style.position = 'relative';
    capsule.appendChild(npDiv);
  }
}

function observeCapsule(): void {
  if (!mainDoc || !topCapsuleClass) return;
  const capsule = mainDoc.querySelector(`div.${topCapsuleClass}`);
  if (!capsule || (capsule as HTMLElement).dataset.gtsObserved) return;
  const parent = capsule.parentElement;
  if (!parent) return;
  (capsule as HTMLElement).dataset.gtsObserved = '1';
  capsuleObserver?.disconnect();
  capsuleObserver = new MutationObserver(() => void renderApp());
  capsuleObserver.observe(parent, { subtree: true, childList: true });
}

async function renderApp(): Promise<void> {
  if (!mainDoc) return;
  try {
    await injectButton(mainDoc);
    injectNowPlaying(mainDoc);
    observeCapsule();
  } catch {}
}

async function boot(): Promise<void> {
  if (bootRunning) return;
  bootRunning = true;
  try {
    for (;;) {
      if (!active || !mainDoc) return;
      await renderApp();
      if (mainDoc && findMusicButton(mainDoc)) return;
      await sleep(POLL_MS);
    }
  } finally {
    bootRunning = false;
  }
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
      if (mwbm.m_lastLocation?.pathname?.startsWith('/library/app/')) void renderApp();
    });
  };
  trySetup();
}

function setupMainWindow(popup: any): void {
  const doc = popup?.m_popup?.document as Document | undefined;
  if (!doc?.body) return;
  mainDoc = doc;
  void boot();
  watchRequests();
}

export function setupGamePageButton(): void {
  if (active) return;
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

export function removeGamePageButton(): void {
  active = false;
  capsuleObserver?.disconnect();
  capsuleObserver = null;
  watchedBrowser = null;
  mainDoc?.querySelector(`.${MUSIC_BTN_CLASS}`)?.remove();
  mainDoc?.querySelector(`.${NOW_PLAYING_CLASS}`)?.remove();
  mainDoc = null;
}
