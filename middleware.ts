// Security Middleware - Blocks unauthorized services and protects API keys
// i18n middleware disabled - pages work without locale prefix
// Access pages directly: /dashboard, /dashboard/ai-monitoring, etc.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ===========================================
// SECURITY: Blocked Services & Patterns
// ===========================================
const BLOCKED_PATTERNS = [
  // Supabase - STRICTLY BLOCKED
  /supabase/i,
  /\.supabase\.co/i,
  /supabase-js/i,

  // Other blocked external services (add as needed)
  // /firebase/i,
  // /aws-sdk/i,
]

const BLOCKED_HEADERS = [
  'apikey',
  'x-supabase-key',
  'x-supabase-auth',
  'authorization', // Block if contains supabase
]

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const url = request.url

  // ===========================================
  // SECURITY CHECK 1: Block Supabase-related URLs
  // ===========================================
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url) || pattern.test(pathname)) {
      console.warn(`[SECURITY] Blocked request to: ${url}`)
      return new NextResponse(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Access to this service is not allowed',
          code: 'SERVICE_BLOCKED',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // ===========================================
  // SECURITY CHECK 2: Block suspicious headers
  // ===========================================
  const authHeader = request.headers.get('authorization')
  if (authHeader && /supabase/i.test(authHeader)) {
    console.warn(`[SECURITY] Blocked supabase auth header`)
    return new NextResponse(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Supabase authentication is not allowed',
        code: 'SUPABASE_BLOCKED',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // Check for supabase-specific headers
  if (request.headers.get('apikey') || request.headers.get('x-supabase-key')) {
    console.warn(`[SECURITY] Blocked supabase API key header`)
    return new NextResponse(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Supabase API keys are not allowed',
        code: 'SUPABASE_KEY_BLOCKED',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // ===========================================
  // SECURITY CHECK 3: Block API routes with supabase in body
  // ===========================================
  if (pathname.startsWith('/api/') && request.method === 'POST') {
    // Note: Can't easily check body in middleware, but URL is blocked above
  }

  // ===========================================
  // i18n redirects (existing logic)
  // ===========================================
  if (pathname.startsWith('/ko')) {
    const newPath = pathname.replace('/ko', '') || '/'
    return NextResponse.redirect(new URL(newPath, request.url))
  }

  if (pathname.startsWith('/ja')) {
    const newPath = pathname.replace('/ja', '') || '/'
    return NextResponse.redirect(new URL(newPath, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // i18n routes
    '/(ko|ja)/:path*',
    // API routes (for security checks)
    '/api/:path*',
    // All routes for supabase blocking
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
