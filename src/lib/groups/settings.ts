import { z } from 'zod'

/**
 * Per-group moderation rules.
 *
 * Every option here CHANGES BEHAVIOUR in a write path — there are no
 * decorative switches. Precedence is group → workspace → these defaults,
 * so an unset group behaves exactly as the workspace always did.
 *
 * Deliberately NOT offered: anything that would let a group opt out of
 * detection entirely or out of the audit trail. Contact info is always
 * detected and always recorded; a group may only choose whether a finding
 * HOLDS the message or merely flags it for the admin.
 */

export const groupSettingsSchema = z.object({
  /** false → detected contact info delivers immediately, still flagged. */
  hold_contact_info: z.boolean().optional(),
  /**
   * Strict mode for a group where numbers have no business being exchanged
   * at all: hold ANY digit run this long, whatever it looks like and
   * whatever surrounds it. Unset means off.
   *
   * Measured against the corpus so the choice is an informed one:
   *
   *   7+  holds ~22% of ordinary work chat — invoice and order refs, zoom
   *       ids, tracking numbers
   *   4+  adds years, room numbers, ports, error codes
   *   1   holds ~66% — "standup in 10", "meet at 3pm", "v2.0.1 is tagged"
   *
   * 1 is allowed because a group can legitimately want it: a client room
   * where the rule is simply "no numbers here, take it to a call". It is a
   * per-group decision and the price is paid only by that group. It would
   * be the wrong default for a working team, and it is not the default.
   */
  hold_numbers_min_digits: z.number().int().min(1).max(20).optional(),
  /** false → filenames are not scanned (contents never were, v1). */
  scan_filenames: z.boolean().optional(),
  /** false → uploads rejected in this group. */
  allow_files: z.boolean().optional(),
  /** Minutes before a held message escalates to the group manager. */
  escalate_minutes: z.number().int().min(0).max(10_080).optional(),
  /** Hours before a held message auto-releases (flagged). */
  auto_approve_hours: z.number().int().min(0).max(720).optional(),
})

export type GroupSettings = z.infer<typeof groupSettingsSchema>

export type ResolvedGroupSettings = {
  holdContactInfo: boolean
  /** null = off. Digits at or above this always hold in this group. */
  holdNumbersMinDigits: number | null
  scanFilenames: boolean
  allowFiles: boolean
  escalateMinutes: number
  autoApproveHours: number
}

export const GROUP_SETTING_DEFAULTS: ResolvedGroupSettings = {
  holdContactInfo: true,
  holdNumbersMinDigits: null,
  scanFilenames: true,
  allowFiles: true,
  escalateMinutes: 30,
  autoApproveHours: 8,
}

/** Group value, else workspace value, else the product default. */
export function resolveGroupSettings(
  groupSettings: unknown,
  workspaceModeration?: unknown,
): ResolvedGroupSettings {
  const group = groupSettingsSchema.safeParse(groupSettings ?? {})
  const g: GroupSettings = group.success ? group.data : {}
  const workspace = groupSettingsSchema.safeParse(workspaceModeration ?? {})
  const w: GroupSettings = workspace.success ? workspace.data : {}

  return {
    holdContactInfo:
      g.hold_contact_info ??
      w.hold_contact_info ??
      GROUP_SETTING_DEFAULTS.holdContactInfo,
    holdNumbersMinDigits:
      g.hold_numbers_min_digits ??
      w.hold_numbers_min_digits ??
      GROUP_SETTING_DEFAULTS.holdNumbersMinDigits,
    scanFilenames:
      g.scan_filenames ?? w.scan_filenames ?? GROUP_SETTING_DEFAULTS.scanFilenames,
    allowFiles: g.allow_files ?? w.allow_files ?? GROUP_SETTING_DEFAULTS.allowFiles,
    escalateMinutes:
      g.escalate_minutes ??
      w.escalate_minutes ??
      GROUP_SETTING_DEFAULTS.escalateMinutes,
    autoApproveHours:
      g.auto_approve_hours ??
      w.auto_approve_hours ??
      GROUP_SETTING_DEFAULTS.autoApproveHours,
  }
}
