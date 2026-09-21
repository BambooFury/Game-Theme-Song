import { findModule, Millennium } from 'millennium';
import { openManagerPopup } from '../settings/managerPopups';

const MUSIC_BTN_CLASS = 'gts-music-btn';
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:1.2em;height:1.2em;" fill="currentColor"><path d="M18.622 3.217A1 1 0 0 1 19 4v11.667q0 .06-.007.121q.007.105.007.212a3 3 0 1 1-2-2.83V9.26l-8 1.867v6.876a3 3 0 1 1-2-2.832V6.333a1 1 0 0 1 .773-.974l10-2.333a1 1 0 0 1 .842.186z"/></svg>';

let inPageClass = '';
let btnContClass = '';
let menuBtnClass = '';
let topCapsuleClass = '';

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

async function waitForElement(doc: Document, selector: string): Promise<Element | null> {
  try {
    const els = await Millennium.findElement(doc, selector, 10000);
    return els[0] ?? null;
  } catch {
    return null;
  }
}

function injectButton(doc: Document): void {
  resolveClasses();
  if (!inPageClass || !btnContClass || !menuBtnClass) return;

  const selector = `div.${inPageClass} div.${btnContClass} > div.${menuBtnClass}:not([role="button"])`;
  let target: Element | null = null;
  try { target = doc.querySelector(selector); } catch {}

  if (target && !target.parentNode?.querySelector(`.${MUSIC_BTN_CLASS}`)) {
    const btn = target.cloneNode(true) as Element;
    btn.classList.add(MUSIC_BTN_CLASS);
    const firstChild = btn.firstChild as Element | null;
    if (firstChild) {
      firstChild.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">${ICON_SVG}</div>`;
    }
    target.parentNode?.insertBefore(btn, target.nextSibling);
    btn.addEventListener('click', () => {
      openManagerPopup('main');
    });
  }
}

function injectNowPlaying(doc: Document): void {
  resolveClasses();
  if (!topCapsuleClass) return;

  const capsule = doc.querySelector(`div.${topCapsuleClass}`);
  if (capsule && !capsule.querySelector('.gts-now-playing')) {
    const npDiv = doc.createElement('div');
    npDiv.className = 'gts-now-playing';
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

let hooked = false;
let intervals: ReturnType<typeof setInterval>[] = [];

function setupForPopup(popup: any): void {
  const doc = popup?.m_popup?.document as Document | undefined;
  if (!doc) return;

  const tryInject = () => {
    if (!doc.querySelector(`.${MUSIC_BTN_CLASS}`)) {
      injectButton(doc);
    }
    injectNowPlaying(doc);
  };

  setTimeout(tryInject, 2000);
  const iv = setInterval(tryInject, 3000);
  intervals.push(iv);

  setTimeout(() => {
    const mwbm = (window as any).MainWindowBrowserManager;
    if (!mwbm?.m_browser?.on) return;
    mwbm.m_browser.on('finished-request', () => {
      if (mwbm.m_lastLocation?.pathname?.startsWith('/library/app/')) {
        tryInject();
        try {
          const capsule = doc.querySelector(`div.${topCapsuleClass}`);
          if (capsule && !(capsule as any).dataset?.gtsObserved) {
            (capsule as any).dataset.gtsObserved = '1';
            new MutationObserver(() => tryInject()).observe(capsule.parentNode, {
              subtree: true,
              childList: true,
            });
          }
        } catch {}
      }
    });
  }, 10000);
}

export function setupGamePageButton(): void {
  if (hooked) return;
  hooked = true;

  try {
    Millennium.AddWindowCreateHook?.(async (popup: any) => {
      await new Promise(r => setTimeout(r, 10000));
      if (popup?.m_strName === 'SP Desktop_uid0') {
        setupForPopup(popup);
      }
    });
  } catch {}
}

export function removeGamePageButton(): void {
  for (const iv of intervals) clearInterval(iv);
  intervals = [];
  hooked = false;
}
