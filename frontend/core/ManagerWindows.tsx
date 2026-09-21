import React, { useEffect, useState } from 'react';
import { SteamDialog } from './SteamDialog';
import { setGlobalCustomCount } from './engine';
import { closeManagerPopup, subscribeManagerPopups, type ManagerPopup } from '../settings/managerPopups';
import { LibraryModalContent } from '../settings/LibraryModal';
import { CacheModalContent } from '../settings/CacheModal';
import { MainPopupContent } from './MainPopup';

export const ManagerWindows: React.FC = () => {
  const [popups, setPopups] = useState<Record<ManagerPopup, boolean>>({ library: false, cache: false, main: false });
  useEffect(() => subscribeManagerPopups(setPopups), []);

  return (
    <>
      {popups.main && (
        <SteamDialog
          strTitle="Game Theme Song"
          onDismiss={() => closeManagerPopup('main')}
          popupWidth={520}
          popupHeight={Math.round(window.innerHeight * 0.7)}
          minWidth={420}
          minHeight={380}
          resizable
          saveDimensionsKey="gtsMainPopup"
        >
          <MainPopupContent onDismiss={() => closeManagerPopup('main')} />
        </SteamDialog>
      )}
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