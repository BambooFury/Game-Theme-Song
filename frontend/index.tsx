import { definePlugin, routerHook } from 'millennium';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce, startFocusWatch, stopFocusWatch } from './core/engine';
import { ManagerWindows } from './core/ManagerWindows';
import { setupNowPlaying, removeNowPlaying } from './core/NowPlaying';

export { hookedMusicButton } from './core/MusicButtonHook';

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
		onDismount() {
			routerHook.removeGlobalComponent('GTSManagerWindows');
			unregisterLaunchStop();
			stopFocusWatch();
			removeNowPlaying();
		},
	};
});
