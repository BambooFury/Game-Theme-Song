import { ConfirmModal, DialogBodyText, showModal } from 'millennium';

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
          <DialogBodyText>Look for the music note button. On any game page in your Library, a small music note button appears — click it anytime to control playback and settings.</DialogBodyText>
          <DialogBodyText>Plays automatically. The theme song fades in softly in the background and fades out when you leave the page or switch games.</DialogBodyText>
          <DialogBodyText>Set your own music. In the popup's Settings tab, pick Custom game music to choose your own audio file for any game — it always plays before the auto search.</DialogBodyText>
          <DialogBodyText>Faster every next visit. The first play for a game can take a few seconds while a fresh audio link is found. After that the track is cached and starts almost instantly.</DialogBodyText>
          <DialogBodyText>Tune it your way. Open the popup's Settings tab to set the volume, loop the song, or cap how long each theme plays.</DialogBodyText>
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
