'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  isDesktopShell,
  shellRequestNotifyPermission,
} from '@/lib/desktop-shell'

/**
 * Desktop-notification preference — permission (a browser fact) plus an
 * explicit on/off the user controls from the account menu. Kept in
 * localStorage so it persists, and mirrored across every component that
 * reads it (both account menus + the listener) via a window event, so the
 * toggle and the notifier never disagree.
 *
 * `ready` is the single gate the notifier checks: notifications only fire
 * when the browser granted permission AND the user turned them on.
 */

const KEY = 'confide-notify'
const EVENT = 'confide-notify-change'

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function useDesktopNotifications() {
  const [permission, setPermission] = useState<NotifyPermission>('default')
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // Deferred — React 19 lint: no synchronous setState in an effect body.
    queueMicrotask(() => {
      // Desktop shell: notifications go through the native plugin, not the
      // webview's Notification API (which WebView2/WKWebView don't honor).
      if (isDesktopShell()) {
        setPermission('granted')
        setEnabled(localStorage.getItem(KEY) === 'on')
        return
      }
      if (typeof Notification === 'undefined') {
        setPermission('unsupported')
        return
      }
      setPermission(Notification.permission as NotifyPermission)
      setEnabled(localStorage.getItem(KEY) === 'on')
    })
    const sync = () => setEnabled(localStorage.getItem(KEY) === 'on')
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (isDesktopShell()) {
      // macOS asks the user once at the OS level; Linux just says yes.
      await shellRequestNotifyPermission()
      const next = localStorage.getItem(KEY) === 'on' ? 'off' : 'on'
      localStorage.setItem(KEY, next)
      setEnabled(next === 'on')
      window.dispatchEvent(new Event(EVENT))
      return
    }
    if (typeof Notification === 'undefined') return
    // First enable asks the browser; a hard "denied" can only be undone in
    // the browser's own site settings, so we surface it rather than loop.
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      setPermission(result as NotifyPermission)
      if (result !== 'granted') return
    } else if (Notification.permission === 'denied') {
      setPermission('denied')
      return
    }
    const next = localStorage.getItem(KEY) === 'on' ? 'off' : 'on'
    localStorage.setItem(KEY, next)
    setEnabled(next === 'on')
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return {
    permission,
    enabled,
    ready: permission === 'granted' && enabled,
    toggle,
  }
}
