import { definePlugin, routerHook } from '@steambrew/client';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce, startFocusWatch, stopFocusWatch } from './core/engine';
import { SearchToast } from './core/SearchToast';
import { SettingsContent } from './settings/SettingsContent';

export default definePlugin(() => {
	void loadSettingsOnce();
	void loadIgnoredOnce();
	routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
	startPolling();
	registerLaunchStop();
	startFocusWatch();
	return {
		title: 'Game Theme Song',
		icon: <></>,
		content: <SettingsContent />,
		onDismount() {
			routerHook.removeGlobalComponent('GTSSearchToast');
			unregisterLaunchStop();
			stopFocusWatch();
		},
	};
});