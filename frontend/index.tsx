import { definePlugin, routerHook, ButtonItem } from 'millennium';
import React from 'react';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce, startFocusWatch, stopFocusWatch } from './core/engine';
import { SearchToast } from './core/SearchToast';
import { ManagerWindows } from './core/ManagerWindows';
import { setupNowPlaying, removeNowPlaying } from './core/NowPlaying';
import { scheduleWelcome } from './core/WelcomeModal';
import { openManagerPopup } from './settings/managerPopups';

export { hookedMusicButton } from './core/MusicButtonHook';

const SettingsContent: React.FC = () => (
  <ButtonItem layout="below" label="Open Game Theme Song" description="Open the theme song popup to control playback and settings." onClick={() => openManagerPopup('main')}>
    Open
  </ButtonItem>
);

export default definePlugin(() => {
	void loadSettingsOnce();
	void loadIgnoredOnce();
	routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
	routerHook.addGlobalComponent('GTSManagerWindows', ManagerWindows);
	scheduleWelcome();
	startPolling();
	registerLaunchStop();
	startFocusWatch();
	setupNowPlaying();
	return {
		title: 'Game Theme Song',
		icon: <></>,
		content: <SettingsContent />,
		onDismount() {
			routerHook.removeGlobalComponent('GTSSearchToast');
			routerHook.removeGlobalComponent('GTSManagerWindows');
			unregisterLaunchStop();
			stopFocusWatch();
			removeNowPlaying();
		},
	};
});
