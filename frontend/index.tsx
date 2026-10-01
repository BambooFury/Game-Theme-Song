import { definePlugin, routerHook } from 'millennium';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce, startFocusWatch, stopFocusWatch } from './core/engine';
import { SearchToast } from './core/SearchToast';
import { ManagerWindows } from './core/ManagerWindows';
import { setupNowPlaying, removeNowPlaying } from './core/NowPlaying';
import { scheduleWelcome } from './core/WelcomeModal';

export { hookedMusicButton } from './core/MusicButtonHook';

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
		onDismount() {
			routerHook.removeGlobalComponent('GTSSearchToast');
			routerHook.removeGlobalComponent('GTSManagerWindows');
			unregisterLaunchStop();
			stopFocusWatch();
			removeNowPlaying();
		},
	};
});
