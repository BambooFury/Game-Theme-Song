import React, { useEffect, useState } from 'react';
import { SteamDialog } from './SteamDialog';
import { closeManagerPopup, subscribeManagerPopups, type ManagerPopup } from '../settings/managerPopups';
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
          popupWidth={620}
          popupHeight={Math.round(window.innerHeight * 0.75)}
          minWidth={520}
          minHeight={480}
          resizable
          saveDimensionsKey="gtsMainPopup"
        >
          <MainPopupContent />
        </SteamDialog>
      )}
    </>
  );
};
