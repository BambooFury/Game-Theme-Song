import { ConfirmModal, DialogBodyText, showModal } from 'millennium';
import { t } from './i18n';

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
      strTitle={t("Welcome to Game Theme Song!")}
      strOKButtonText={t("Got it — turn up the music!")}
      strDescription={
        <>
          <DialogBodyText>В вашей библиотеке Steam появился саундтрек — каждая страница игры теперь играет свою тему.</DialogBodyText>
          <DialogBodyText>Найдите кнопку с нотой. На любой странице игры в библиотеке появилась маленькая кнопка — нажимайте её, чтобы управлять воспроизведением и настройками.</DialogBodyText>
          <DialogBodyText>Автовоспроизведение. Музыка мягко нарастает на фоне и затухает, когда вы уходите со страницы или переключаете игру.</DialogBodyText>
          <DialogBodyText>Своя музыка. В табе настроек попапа выберите «Своя музыка», чтобы задать свой аудиофил для любой игры — он всегда играет раньше автопоиска.</DialogBodyText>
          <DialogBodyText>Быстрее с каждым разом. Первое воспроизведение может занять несколько секунд, пока находится аудио. После этого трек кэшируется и стартует почти мгновенно.</DialogBodyText>
          <DialogBodyText>Настройте под себя. В табе настроек попапа задайте громкость, повтор песни или ограничение её длительности.</DialogBodyText>
          <DialogBodyText>Это сообщение больше не появится.</DialogBodyText>
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
