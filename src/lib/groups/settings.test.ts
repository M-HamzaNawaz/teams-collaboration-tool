import { describe, expect, it } from 'vitest'

import {
  GROUP_SETTING_DEFAULTS,
  groupSettingsSchema,
  resolveGroupSettings,
} from './settings'

describe('group settings resolution', () => {
  it('an unset group behaves exactly as before (defaults)', () => {
    expect(resolveGroupSettings({}, {})).toEqual(GROUP_SETTING_DEFAULTS)
    expect(resolveGroupSettings(null, null)).toEqual(GROUP_SETTING_DEFAULTS)
  })

  it('group beats workspace beats default', () => {
    const resolved = resolveGroupSettings(
      { escalate_minutes: 5 },
      { escalate_minutes: 60, auto_approve_hours: 24 },
    )
    expect(resolved.escalateMinutes).toBe(5) // group wins
    expect(resolved.autoApproveHours).toBe(24) // workspace fills the gap
    expect(resolved.holdContactInfo).toBe(true) // default fills the rest
  })

  it('holding can be relaxed to flag-only per group', () => {
    expect(resolveGroupSettings({ hold_contact_info: false }).holdContactInfo).toBe(
      false,
    )
  })

  it('garbage settings fail closed to defaults, never crash', () => {
    expect(resolveGroupSettings('not an object')).toEqual(GROUP_SETTING_DEFAULTS)
    expect(resolveGroupSettings({ hold_contact_info: 'yes' })).toEqual(
      GROUP_SETTING_DEFAULTS,
    )
    expect(resolveGroupSettings({ escalate_minutes: -5 })).toEqual(
      GROUP_SETTING_DEFAULTS,
    )
  })

  it('the schema rejects unreasonable timers', () => {
    expect(groupSettingsSchema.safeParse({ escalate_minutes: 99_999 }).success).toBe(
      false,
    )
    expect(groupSettingsSchema.safeParse({ auto_approve_hours: 720 }).success).toBe(
      true,
    )
  })

  it('offers no way to disable detection or auditing', () => {
    const keys = Object.keys(groupSettingsSchema.shape)
    expect(keys).not.toContain('detect')
    expect(keys).not.toContain('audit')
    expect(keys).not.toContain('skip_detection')
  })
})
