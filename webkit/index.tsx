import { showWelcomeIfFirstTime } from './welcome-modal';

const STORE_HOST = 'store.steampowered.com';

function isStorefront(): boolean {
  if (location.hostname !== STORE_HOST) return false;
  const p = location.pathname;
  return p === '' || p === '/' ||
         p.indexOf('/featured') === 0 ||
         p.indexOf('/explore')  === 0;
}

export default async function WebkitMain() {
  if (!isStorefront()) return;
  showWelcomeIfFirstTime();
}