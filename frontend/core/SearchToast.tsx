import React, { useState, useEffect } from 'react';
import { SEARCH_TOAST_CSS, SEARCH_TOAST_ICON, SEARCH_TOAST_X, SEARCH_TOAST_CHECK } from '../_assets.generated';
import { state, getToast, subscribeToast, rerollCurrent, acceptCurrent } from './engine';

export const SearchToast: React.FC = () => {
  const [toast, setToast] = useState(getToast());

  useEffect(() => subscribeToast(setToast), []);

  const visible = toast.mode !== 'off';
  const searching = toast.mode === 'searching';
  const manual = state.settings.manual_search;
  const cls = ['gts-search-toast-root'];
  if (visible) cls.push('gts-show');
  cls.push(searching ? 'gts-searching' : 'gts-ready');

  const label = searching ? 'Searching music' : (toast.title || 'Theme ready');

  return (
    <>
      <style>{SEARCH_TOAST_CSS}</style>
      <div id="gts-search-toast" className={cls.join(' ')}>
        <span className="gts-search-toast-icon" dangerouslySetInnerHTML={{ __html: SEARCH_TOAST_ICON }} />
        <span className="gts-search-toast-label">{label}</span>
        {manual ? (
          <div className="gts-search-toast-actions">
            <button
              type="button"
              className="gts-toast-btn gts-toast-reject"
              title="Find another track"
              disabled={searching}
              onClick={() => { void rerollCurrent(); }}
              dangerouslySetInnerHTML={{ __html: SEARCH_TOAST_X }}
            />
            <button
              type="button"
              className="gts-toast-btn gts-toast-accept"
              title="Keep this track"
              disabled={searching}
              onClick={() => acceptCurrent()}
              dangerouslySetInnerHTML={{ __html: SEARCH_TOAST_CHECK }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
};
