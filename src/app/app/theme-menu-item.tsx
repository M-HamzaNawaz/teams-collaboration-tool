'use client'

import { useState } from 'react'

import { SunIcon } from '@/lib/ui/icons'

import { ThemeDialog } from './theme-dialog'

/** "Theme" line in the account menu — opens the color-theme picker. */
export function ThemeMenuItem() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
      >
        <SunIcon />
        <span>Theme</span>
      </button>
      {open && <ThemeDialog onClose={() => setOpen(false)} />}
    </>
  )
}
