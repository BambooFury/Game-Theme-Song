import React, { useEffect, useState } from 'react';
import { SteamDialog } from './SteamDialog';
import { setGlobalCustomCount } from './engine';
import { closeManagerPopup, subscribeManagerPopups, type ManagerPopup } from '../settings/managerPopups';
import { LibraryModalContent } from '../settings/LibraryModal';
import { CacheModalContent } from '../settings/CacheModal';

/**
 * Manager windows rendered as native Steam popups. Mounted once in the main
 * window via routerHook so the popups outlive the Millennium settings panel.
 */
export const ManagerWindows: React.FC = () => {
  const [popups, setPopups] = useState<Record<ManagerPopup, boolean>>({ library: false, cache: false });
  useEffect(() => subscribeManagerPopups(setPopups), []);

  return (
    <>
      {popups.library && (
        <SteamDialog
          strTitle="Custom game music"
          onDismiss={() => closeManagerPopup('library')}
          popupWidth={1000}
          popupHeight={Math.round(window.innerHeight * 0.7)}
          minWidth={760}
          minHeight={480}
          resizable
          saveDimensionsKey="gtsLibraryPopup"
        >
          <LibraryModalContent onChanged={(map) => setGlobalCustomCount(Object.keys(map).length)} />
        </SteamDialog>
      )}
      {popups.cache && (
        <SteamDialog
          strTitle="Downloaded music"
          onDismiss={() => closeManagerPopup('cache')}
          popupWidth={820}
          popupHeight={Math.round(window.innerHeight * 0.6)}
          minWidth={640}
          minHeight={420}
          resizable
          saveDimensionsKey="gtsCachePopup"
        >
          <CacheModalContent />
        </SteamDialog>
      )}
    </>
  );
};