import React from 'react';
import { definePlugin, routerHook, ButtonItem } from 'millennium';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce, startFocusWatch, stopFocusWatch } from './core/engine';
import { ManagerWindows } from './core/ManagerWindows';
import { setupNowPlaying, removeNowPlaying } from './core/NowPlaying';
import { openManagerPopup } from './settings/managerPopups';
import { t } from './core/i18n';

export { hookedMusicButton } from './core/MusicButtonHook';

const isLinux = /linux/i.test(navigator.userAgent);

const SettingsContent: React.FC = () => (
	<ButtonItem
		layout="below"
		label={t('Open Game Theme Song')}
		description={t('Opens the music popup - the note button does not show on this platform.')}
		onClick={() => openManagerPopup('main')}
	>
		{t('Open')}
	</ButtonItem>
);

export default definePlugin(() => {
	void loadSettingsOnce();
	void loadIgnoredOnce();
	routerHook.addGlobalComponent('GTSManagerWindows', ManagerWindows);
	startPolling();
	registerLaunchStop();
	startFocusWatch();
	setupNowPlaying();
	return {
		title: 'Game Theme Song',
		icon: <></>,
		content: isLinux ? <SettingsContent /> : undefined,
		onDismount() {
			routerHook.removeGlobalComponent('GTSManagerWindows');
			unregisterLaunchStop();
			stopFocusWatch();
			removeNowPlaying();
		},
	};
});
