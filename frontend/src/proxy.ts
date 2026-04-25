import { NextRequest, NextResponse } from 'next/server'

const REALM = 'Modern Accounting App'

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`
    }
  })
}

function parseBasicAuthorization(headerValue: string | null) {
  if (!headerValue) {
    return null
  }

  const [scheme, encoded] = headerValue.split(' ')

  if (scheme !== 'Basic' || !encoded) {
    return null
  }

  try {
    const decoded = atob(encoded)
    const separatorIndex = decoded.indexOf(':')

    if (separatorIndex === -1) {
      return null
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    }
  } catch {
    return null
  }
}

export function proxy(request: NextRequest) {
  const expectedUsername = process.env.BASIC_AUTH_USER
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD

  if (!expectedUsername && !expectedPassword) {
    return NextResponse.next()
  }

  if (!expectedUsername || !expectedPassword) {
    return new NextResponse('Basic auth is misconfigured', { status: 500 })
  }

  const credentials = parseBasicAuthorization(request.headers.get('authorization'))

  if (
    credentials?.username === expectedUsername &&
    credentials.password === expectedPassword
  ) {
    return NextResponse.next()
  }

  return unauthorized()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|frontend-health).*)']
}
