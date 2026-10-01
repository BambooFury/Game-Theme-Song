import { findModule } from 'millennium';

const MAIN_WINDOW_NAME = 'SP Desktop_uid0';
const NOW_PLAYING_CLASS = 'gts-now-playing';
const POLL_MS = 500;
const SETUP_TIMEOUT_MS = 120000;
let topCapsuleClass = '';
let active = false;
let mainDoc: Document | null = null;
let capsuleObserver: MutationObserver | null = null;
let watchedBrowser: unknown = null;

function resolveClasses() {
  if (!topCapsuleClass) {
    try { topCapsuleClass = findModule((e: any) => e.TopCapsule)?.TopCapsule ?? ''; } catch {}
  }
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
  capsuleObserver = new MutationObserver(() => {
    if (!mainDoc) return;
    try { injectNowPlaying(mainDoc); } catch {}
  });
  capsuleObserver.observe(parent, { subtree: true, childList: true });
}

async function renderApp(): Promise<void> {
  if (!mainDoc) return;
  try {
    resolveClasses();
    injectNowPlaying(mainDoc);
    observeCapsule();
  } catch {}
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
  void renderApp();
  watchRequests();
}

export function setupNowPlaying(): void {
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

export function removeNowPlaying(): void {
  active = false;
  capsuleObserver?.disconnect();
  capsuleObserver = null;
  watchedBrowser = null;
  mainDoc?.querySelector(`.${NOW_PLAYING_CLASS}`)?.remove();
  mainDoc = null;
}
