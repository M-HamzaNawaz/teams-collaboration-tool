import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '@/lib/env/public'

/**
 * Auth proxy (M3-01). Next 16 renamed `middleware` to `proxy` — same role:
 * runs before rendering on every matched request.
 *
 * Two jobs:
 *  1. Session refresh — JWTs live 10 minutes (M3-02); this transparently
 *     rotates them via the refresh token so users never see a re-login.
 *     auth.getUser() both validates and refreshes.
 *  2. Route protection — /app/** requires a session; /login and /signup
 *     bounce already-authenticated users into the app.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (path.startsWith('/app') && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  if ((path === '/login' || path === '/signup') && user) {
    const appUrl = request.nextUrl.clone()
    appUrl.pathname = '/app'
    appUrl.search = ''
    return NextResponse.redirect(appUrl)
  }

  return response
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup'],
}
