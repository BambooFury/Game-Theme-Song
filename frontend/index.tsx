import { IconsModule, definePlugin, routerHook } from '@steambrew/client';
import { loadSettingsOnce, startPolling, registerLaunchStop, unregisterLaunchStop } from './core/engine';
import { SearchToast } from './core/SearchToast';
import { LibraryWindow } from './settings/LibraryModal';
import { CacheWindow } from './settings/CacheModal';
import { SettingsContent } from './settings/SettingsContent';

export default definePlugin(() => {
  void loadSettingsOnce();
  routerHook.addGlobalComponent('GTSSearchToast', SearchToast);
  routerHook.addGlobalComponent('GTSLibraryWindow', LibraryWindow);
  routerHook.addGlobalComponent('GTSCacheWindow', CacheWindow);
  startPolling();
  registerLaunchStop();
  return {
    title: 'Game Theme Song',
    icon: <IconsModule.Music />,
    content: <SettingsContent />,
    onDismount() {
      routerHook.removeGlobalComponent('GTSSearchToast');
      routerHook.removeGlobalComponent('GTSLibraryWindow');
      routerHook.removeGlobalComponent('GTSCacheWindow');
      unregisterLaunchStop();
    },
  };
});
