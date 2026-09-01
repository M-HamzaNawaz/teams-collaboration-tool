/**
 * GET /api/downloads — current installer links for the /download page.
 *
 * Desktop and Android publish under SEPARATE release tags (desktop-v* /
 * android-v*), so "releases/latest" alone would flip between families
 * depending on which shipped last. This reads the recent releases and
 * takes the newest of EACH family. Cached 10 minutes, server-side so
 * browser rate limits never bite.
 */

const RELEASES_API =
  'https://api.github.com/repos/M-HamzaNawaz/teams-collaboration-tool/releases?per_page=15'

type Release = {
  tag_name: string
  assets: Array<{ name: string; browser_download_url: string }>
}

export async function GET() {
  const response = await fetch(RELEASES_API, {
    headers: { accept: 'application/vnd.github+json' },
    next: { revalidate: 600 },
  })
  if (!response.ok) {
    return Response.json({ error: 'releases unavailable' }, { status: 502 })
  }
  const releases = (await response.json()) as Release[]

  // The API returns newest-first, so the first match per family wins.
  const desktop = releases.find((r) => r.tag_name.startsWith('desktop-v'))
  const android = releases.find(
    (r) =>
      r.tag_name.startsWith('android-v') &&
      r.assets.some((a) => a.name.endsWith('.apk')),
  )

  const from = (release: Release | undefined, test: (name: string) => boolean) =>
    release?.assets.find((a) => test(a.name))?.browser_download_url ?? null

  return Response.json(
    {
      version: desktop?.tag_name.replace(/^desktop-v/, '') ?? null,
      windows: from(desktop, (n) => n.endsWith('-setup.exe')),
      mac: from(desktop, (n) => n.endsWith('.dmg')),
      linuxAppImage: from(desktop, (n) => n.endsWith('.AppImage')),
      linuxDeb: from(desktop, (n) => n.endsWith('.deb')),
      android: from(android, (n) => n.endsWith('.apk')),
    },
    { headers: { 'cache-control': 'public, max-age=600' } },
  )
}
