import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * /api/audit/verify (M9-03).
 *   GET  — the last stored verification result for this workspace.
 *   POST — run verify_audit_chain() NOW, store, and return the verdict.
 * Admin-only: chain status is part of the evidence surface.
 */

async function requireAdmin() {
  const session = await getSession()
  if (!session) {
    return {
      error: Response.json({ error: 'authentication required' }, { status: 401 }),
    }
  }
  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId: session.profile.workspace_id,
    action: 'workspace.manage',
  })
  if (!authz.ok) {
    return {
      error: Response.json({ error: authz.reason }, { status: authz.status }),
    }
  }
  return { session, service, workspaceId: session.profile.workspace_id }
}

export async function GET() {
  const ctx = await requireAdmin()
  if ('error' in ctx) return ctx.error

  const { data } = await ctx.service
    .from('audit_chain_checks')
    .select('ok, first_bad_id, checked_at')
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()

  return Response.json({ check: data ?? null })
}

export async function POST() {
  const ctx = await requireAdmin()
  if ('error' in ctx) return ctx.error

  const { data, error } = await ctx.service.rpc('verify_audit_chain', {
    p_workspace_id: ctx.workspaceId,
  })
  if (error) {
    return Response.json({ error: 'verification failed to run' }, { status: 500 })
  }

  const verdict = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean
    first_bad_id: number | null
  }
  const checkedAt = new Date().toISOString()

  await ctx.service.from('audit_chain_checks').upsert({
    workspace_id: ctx.workspaceId,
    ok: verdict.ok,
    first_bad_id: verdict.first_bad_id,
    checked_at: checkedAt,
  })

  return Response.json({
    check: { ok: verdict.ok, first_bad_id: verdict.first_bad_id, checked_at: checkedAt },
  })
}
