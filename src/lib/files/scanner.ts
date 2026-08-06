import 'server-only'

/**
 * Virus-scan seam (M7-03).
 *
 * v1 ships the stub — the spec accepts that — but every file still passes
 * through THIS interface, so swapping in a real scanner (ClamAV sidecar,
 * VirusTotal, a cloud scan API) is a change to one adapter and nothing
 * else. The route awaits scan() before the file row is written, and the
 * download route refuses anything not 'clean' or 'skipped'.
 */

export type ScanResult = 'clean' | 'infected' | 'skipped'

export type FileScanner = {
  /** Name recorded nowhere yet, but useful for logs when a real one lands. */
  name: string
  scan(input: { name: string; mime: string; bytes: ArrayBuffer }): Promise<ScanResult>
}

/** v1: no scanning — 'skipped' is an honest status, not a fake 'clean'. */
export const stubScanner: FileScanner = {
  name: 'stub',
  async scan() {
    return 'skipped'
  },
}

/** The active scanner. Swap the assignment when a real adapter exists. */
export const scanner: FileScanner = stubScanner
