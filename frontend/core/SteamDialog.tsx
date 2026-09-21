import React from 'react';
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

// Steam's own popup-window dialog (the same chrome as Screenshots, Properties, etc.).
const GenericDialog = findModuleExport(
  (e: any) =>
    e?.toString?.()?.includes('.popupHeight') === true
    && e?.toString?.()?.includes('.popupWidth') === true
    && e?.toString?.()?.includes('.onlyPopoutIfNeeded') === true,
) as unknown as React.FC<GenericDialogProps & { children?: React.ReactNode }>;

/** Renders children inside a native, movable and resizable Steam popup window. */
export const SteamDialog: React.FC<GenericDialogProps & { children?: React.ReactNode }> = ({ children, ...props }) => (
  <GenericDialog modal={false} {...props}>
    <ModalRoot onCancel={props.onDismiss}>{children}</ModalRoot>
  </GenericDialog>
);