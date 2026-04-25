import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001'

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

function basicAuthHeader() {
  const username = process.env.BASIC_AUTH_USER
  const password = process.env.BASIC_AUTH_PASSWORD

  if (!username && !password) {
    return undefined
  }

  if (!username || !password) {
    throw new Error('Basic auth is misconfigured')
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function buildUpstreamUrl(path: string[], request: NextRequest) {
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`
  const upstreamUrl = new URL(path.map(encodeURIComponent).join('/'), baseUrl)
  upstreamUrl.search = request.nextUrl.search

  return upstreamUrl
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  try {
    const { path } = await context.params
    const upstreamUrl = buildUpstreamUrl(path, request)
    const headers = new Headers()
    const contentType = request.headers.get('content-type')
    const accept = request.headers.get('accept')
    const authorization = basicAuthHeader()

    if (contentType) {
      headers.set('content-type', contentType)
    }

    if (accept) {
      headers.set('accept', accept)
    }

    if (authorization) {
      headers.set('authorization', authorization)
    }

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual'
    })

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')
    responseHeaders.delete('transfer-encoding')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('Backend proxy failed:', error)

    return NextResponse.json(
      { error: 'APIへの接続に失敗しました' },
      { status: 502 }
    )
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
