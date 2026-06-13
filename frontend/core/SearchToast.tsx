import React, { useState, useEffect } from 'react';
import { SEARCH_TOAST_CSS, SEARCH_TOAST_ICON } from '../_assets.generated';
import { isSearching, subscribeSearching } from './engine';

export const SearchToast: React.FC = () => {
  const [on, setOn] = useState(isSearching());

  useEffect(() => subscribeSearching(setOn), []);

  return (
    <>
      <style>{SEARCH_TOAST_CSS}</style>
      <div id="gts-search-toast" className={on ? 'gts-show' : ''}>
        <span className="gts-search-toast-icon" dangerouslySetInnerHTML={{ __html: SEARCH_TOAST_ICON }} />
        <span>Searching music&hellip;</span>
      </div>
    </>
  );
};
