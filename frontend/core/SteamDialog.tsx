import React, { useEffect } from 'react';
import { findModuleExport, ModalRoot } from 'millennium';

interface GenericDialogProps {
  readonly strTitle: string;
  onDismiss(): void;
  readonly popupWidth?: number;
  readonly popupHeight?: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly resizable?: boolean;
  readonly fullscreen?: boolean;
  readonly modal?: boolean;
  readonly saveDimensionsKey?: string;
}

const GenericDialog = findModuleExport(
  (e: any) =>
    e?.toString?.()?.includes('.popupHeight') === true
    && e?.toString?.()?.includes('.popupWidth') === true
    && e?.toString?.()?.includes('.onlyPopoutIfNeeded') === true,
) as unknown as React.FC<GenericDialogProps & { children?: React.ReactNode }>;

const DARK_THEME_CSS = `
:root {
  --main-text-color: #ffffff;
  --secondary-text-color: rgba(255,255,255,0.5);
  --color-online: #5dc26a;
  --color-offline: #898989;
  --color-in-game: #5dc26a;
  --basic-text-color: #ffffff;
  --main-bg-color: #1b1b1b;
  --secondary-bg-color: #2a2a2a;
}
body, html {
  background: #1b1b1b !important;
  color: #ffffff !important;
  font-family: 'Motiva Sans', 'Segoe UI', Arial, sans-serif !important;
}
`;

export const SteamDialog: React.FC<GenericDialogProps & { children?: React.ReactNode }> = ({ children, ...props }) => {
  useEffect(() => {
    const id = 'gts-dark-theme';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = DARK_THEME_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  return (
    <GenericDialog modal={false} {...props}>
      <ModalRoot onCancel={props.onDismiss}>{children}</ModalRoot>
    </GenericDialog>
  );
};
