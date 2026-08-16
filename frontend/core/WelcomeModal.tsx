import { ConfirmModal, DialogBodyText, showModal } from '@steambrew/client';

const SEEN_FLAG = 'gts_welcomed_v6';

function alreadySeen(): boolean {
  try { return localStorage.getItem(SEEN_FLAG) === '1'; }
  catch { return true; }
}

function markSeen() {
  try { localStorage.setItem(SEEN_FLAG, '1'); } catch {}
}

function showWelcome(): void {
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle="Welcome to Game Theme Song!"
      strOKButtonText="Got it — turn up the music!"
      strDescription={
        <>
          <DialogBodyText>Your Steam library just got a soundtrack — every game page now plays its own theme.</DialogBodyText>
          <DialogBodyText>Finds the right theme. Open any game page in your Library and the plugin looks up that game's soundtrack — no setup needed.</DialogBodyText>
          <DialogBodyText>Plays automatically. The theme song fades in softly in the background and fades out when you leave the page or switch games.</DialogBodyText>
          <DialogBodyText>Set your own music. Open Plugin Settings → Custom game music to pick your own audio file for any game — it always plays before the auto search.</DialogBodyText>
          <DialogBodyText>Faster every next visit. The first play for a game can take a few seconds while a fresh audio link is found. After that the track is cached and starts almost instantly.</DialogBodyText>
          <DialogBodyText>Tune it your way. Open Plugin Settings to set the volume, loop the song, or cap how long each theme plays.</DialogBodyText>
          <DialogBodyText>This message won't appear again.</DialogBodyText>
        </>
      }
    />,
    window,
    {
      strTitle: 'Game Theme Song',
      bNeverPopOut: true,
      popupWidth: 520,
    },
  );
}

export function scheduleWelcome(): void {
  if (alreadySeen()) return;
  markSeen();
  setTimeout(() => {
    try { showWelcome(); } catch {}
  }, 2000);
}
