import { definePlugin, routerHook } from 'millennium';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce, startFocusWatch, stopFocusWatch } from './core/engine';
import { SearchToast } from './core/SearchToast';
import { ManagerWindows } from './core/ManagerWindows';
import { SettingsContent } from './settings/SettingsContent';
import { scheduleWelcome } from './core/WelcomeModal';

export default definePlugin(() => {
	void loadSettingsOnce();
	void loadIgnoredOnce();
	routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
	routerHook.addGlobalComponent('GTSManagerWindows', ManagerWindows);
	scheduleWelcome();
	startPolling();
	registerLaunchStop();
	startFocusWatch();
	return {
		title: 'Game Theme Song',
		icon: <></>,
		content: <SettingsContent />,
		onDismount() {
			routerHook.removeGlobalComponent('GTSSearchToast');
			routerHook.removeGlobalComponent('GTSManagerWindows');
			unregisterLaunchStop();
			stopFocusWatch();
		},
	};
});
