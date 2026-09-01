/**
 * GET /api/downloads — the current installer links, straight from the
 * latest GitHub release. The /download page reads this so its buttons
 * always point at the newest version with zero manual editing (asset
 * filenames carry the version, so hardcoded links would rot on every
 * release). Cached for 10 minutes; server-side so browser rate limits
 * never bite.
 */

const RELEASES_API =
  'https://api.github.com/repos/M-HamzaNawaz/teams-collaboration-tool/releases/latest'

type Asset = { name: string; browser_download_url: string }

export async function GET() {
  const response = await fetch(RELEASES_API, {
    headers: { accept: 'application/vnd.github+json' },
    next: { revalidate: 600 },
  })
  if (!response.ok) {
    return Response.json({ error: 'releases unavailable' }, { status: 502 })
  }
  const release = (await response.json()) as {
    tag_name: string
    assets: Asset[]
  }

  const find = (test: (name: string) => boolean) =>
    release.assets.find((a) => test(a.name))?.browser_download_url ?? null

  return Response.json(
    {
      version: release.tag_name.replace(/^desktop-v/, ''),
      windows: find((n) => n.endsWith('-setup.exe')),
      mac: find((n) => n.endsWith('.dmg')),
      linuxAppImage: find((n) => n.endsWith('.AppImage')),
      linuxDeb: find((n) => n.endsWith('.deb')),
      android: find((n) => n.endsWith('.apk')),
    },
    { headers: { 'cache-control': 'public, max-age=600' } },
  )
}
