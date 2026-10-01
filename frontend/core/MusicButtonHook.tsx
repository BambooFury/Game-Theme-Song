import { findModule } from 'millennium';
import { openManagerPopup } from '../settings/managerPopups';

let cachedClasses: Record<string, string> | null = null;

function appButtonClasses(): Record<string, string> | null {
  if (cachedClasses) return cachedClasses;
  try {
    cachedClasses = findModule((e: any) => e.AppButtonsContainer && e.MenuButtonContainer && e.MenuButton) ?? null;
  } catch {}
  return cachedClasses;
}

const MusicButton = () => {
  const classes = appButtonClasses();
  if (!classes?.MenuButtonContainer || !classes?.MenuButton) return null;
  return (
    <div className={classes.MenuButtonContainer}>
      <div
        className={classes.MenuButton}
        role="button"
        tabIndex={0}
        title="Game Theme Song"
        onClick={() => openManagerPopup('main')}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ width: '1.2em', height: '1.2em' }}>
            <path d="M18.622 3.217A1 1 0 0 1 19 4v11.667q0 .06-.007.121q.007.105.007.212a3 3 0 1 1-2-2.83V9.26l-8 1.867v6.876a3 3 0 1 1-2-2.832V6.333a1 1 0 0 1 .773-.974l10-2.333a1 1 0 0 1 .842.186z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
};

/** @ffi */
export const hookedMusicButton = {
  MusicButton,
};
