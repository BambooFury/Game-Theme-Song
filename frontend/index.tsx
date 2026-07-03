import { IconsModule, definePlugin, routerHook } from '@steambrew/client';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop, loadIgnoredOnce } from './core/engine';
import { SearchToast } from './core/SearchToast';
import { SettingsContent } from './settings/SettingsContent';

export default definePlugin(() => {
  void loadSettingsOnce();
  void loadIgnoredOnce();
  routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
  startPolling();
  registerLaunchStop();
  return {
    title: 'Game Theme Song',
    icon: <IconsModule.Music />,
    content: <SettingsContent />,
    onDismount() {
      routerHook.removeGlobalComponent('GTSSearchToast');
      unregisterLaunchStop();
    },
  };
});