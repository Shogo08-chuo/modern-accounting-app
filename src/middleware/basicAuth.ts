import { timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'

const UNAUTHORIZED_HEADERS = {
  'WWW-Authenticate': 'Basic realm="Modern Accounting API", charset="UTF-8"'
} as const

function unauthorized(c: Context) {
  return c.text('Unauthorized', 401, UNAUTHORIZED_HEADERS)
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function parseBasicAuthorizationHeader(headerValue: string) {
  const [scheme, encoded] = headerValue.split(' ')

  if (scheme !== 'Basic' || !encoded) {
    return null
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const separatorIndex = decoded.indexOf(':')

  if (separatorIndex === -1) {
    return null
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  }
}

export const basicAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const expectedUsername = process.env.BASIC_AUTH_USER
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD

  // Allow local development without auth until credentials are configured.
  if (!expectedUsername && !expectedPassword) {
    await next()
    return
  }

  if (!expectedUsername || !expectedPassword) {
    return c.text('Basic auth is misconfigured', 500)
  }

  const authorizationHeader = c.req.header('authorization')

  if (!authorizationHeader) {
    return unauthorized(c)
  }

  const credentials = parseBasicAuthorizationHeader(authorizationHeader)

  if (!credentials) {
    return unauthorized(c)
  }

  const isAuthorized =
    safeEqual(credentials.username, expectedUsername) &&
    safeEqual(credentials.password, expectedPassword)

  if (!isAuthorized) {
    return unauthorized(c)
  }

  await next()
}
