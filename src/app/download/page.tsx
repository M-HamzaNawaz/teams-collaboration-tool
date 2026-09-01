import type { Metadata } from 'next'

import { DownloadClient } from './download-client'

/**
 * /download — public "get the apps" page. Shareable with invitees before
 * they can log in; linked from the login card and the account menu.
 */
export const metadata: Metadata = {
  title: 'Get Confide — desktop & mobile apps',
  description: 'Install Confide on Windows, macOS, Linux, or your phone.',
}

export default function DownloadPage() {
  return <DownloadClient />
}
