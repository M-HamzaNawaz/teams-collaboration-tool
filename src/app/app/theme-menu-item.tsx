'use client'

import { SunIcon } from '@/lib/ui/icons'

/**
 * "Theme" line in the account menu — a plain button; the PARENT owns the
 * dialog state and renders <ThemeDialog/> OUTSIDE the dropdown.
 *
 * That split is load-bearing: the dropdown closes on any mousedown outside
 * the bar, and the dialog is portaled to document.body (outside the bar).
 * When this component owned the dialog, pressing a swatch closed the menu,
 * unmounted this item — and the dialog with it — before the click landed:
 * "no action, no response". Same pattern as Edit profile / name change.
 */
export function ThemeMenuItem(props: { onOpen: () => void }) {
  return (
    <button
      onClick={props.onOpen}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
    >
      <SunIcon />
      <span>Theme</span>
    </button>
  )
}
