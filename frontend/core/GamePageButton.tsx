import React, { useEffect, useState } from 'react';
import { routerHook } from 'millennium';
import { MdMusicNote } from 'react-icons/md';
import { subscribeContext, getContext, isPlaying, subscribePlayback, getPlaybackMode } from './engine';
import { openManagerPopup } from '../settings/managerPopups';

const DESKTOP_UI_MODE = 7;

const BUTTON_STYLE: React.CSSProperties = {
  width: 36,
  height: 36,
  minWidth: 'unset',
  padding: 0,
  boxSizing: 'border-box',
  border: '1px solid transparent',
  borderRadius: '50%',
  position: 'relative',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  color: 'var(--main-text-color, inherit)',
  transition: 'background 0.2s ease, border-color 0.2s ease',
  WebkitAppRegion: 'no-drag',
};

const HOVER_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.2)',
  borderColor: 'gray',
};

const BADGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: 'var(--color-online, #5dc26a)',
  pointerEvents: 'none',
};

const GamePageButtonHost: React.FC = () => {
  const [ctx, setCtx] = useState(getContext());
  const [playing, setPlaying] = useState(isPlaying());
  const [hover, setHover] = useState(false);

  useEffect(() => subscribeContext(setCtx), []);
  useEffect(() => subscribePlayback(() => setPlaying(isPlaying())), []);

  const active = playing || ctx.mode === 'searching';

  const style = {
    ...BUTTON_STYLE,
    ...(hover ? HOVER_STYLE : {}),
  };

  const label = ctx.mode === 'searching' ? 'Searching theme music'
    : playing ? `Playing: ${ctx.title ?? 'theme music'}`
    : 'Game Theme Song';

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, margin: '0 4px', WebkitAppRegion: 'no-drag' }}>
      <button
        type="button"
        style={style}
        title={label}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => openManagerPopup('main')}
      >
        <MdMusicNote size={18} style={{ opacity: active ? 1 : 0.6 }} />
        {active && <span style={BADGE_STYLE} />}
      </button>
    </div>
  );
};

let patchHandle: unknown = null;

export function setupGamePageButton(): void {
  if (patchHandle) return;
  patchHandle = routerHook.addPatch('/library/app', (props: any) => {
    const { createElement: h, Fragment } = (window as any).SP_REACT;
    const Original = props.children.type;
    props.children.type = (p: any) => h(Fragment, null,
      h(Original, p),
      h(GamePageButtonHost, null),
    );
    return props;
  }, DESKTOP_UI_MODE);
}

export function removeGamePageButton(): void {
  if (!patchHandle) return;
  routerHook.removePatch('/library/app', patchHandle as any);
  patchHandle = null;
}
