import 'dotenv/config'
import { createServer } from 'node:http'
import { explainRequestSchema, explainResponseSchema, makeExplanationMessages } from './schema.ts'

const port = Number(process.env.API_PORT || 8787)
const maxBodyBytes = 16_000

async function readJson(request: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBodyBytes) throw new Error('Request is too large.')
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('Request body must be valid JSON.') }
}

function reply(response: import('node:http').ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/health') return reply(response, 200, { ok: true, aiConfigured: Boolean(process.env.AI_API_KEY) })
  if (request.method !== 'POST' || request.url !== '/api/explain') return reply(response, 404, { error: 'Not found.' })
  if (!process.env.AI_API_KEY) return reply(response, 503, { error: 'AI explanations are not configured. Use the deterministic explanation shown in the app.' })
  try {
    const parsed = explainRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return reply(response, 400, { error: 'The explanation request is incomplete or invalid.' })
    const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'gpt-4.1-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: makeExplanationMessages(parsed.data) }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!upstream.ok) return reply(response, 502, { error: 'The explanation provider is temporarily unavailable.' })
    const responseBody = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = responseBody.choices?.[0]?.message?.content
    if (!raw) return reply(response, 502, { error: 'The explanation provider returned no answer.' })
    let decoded: unknown
    try { decoded = JSON.parse(raw) } catch { return reply(response, 502, { error: 'The explanation provider returned an unreadable answer.' }) }
    const validatedOutput = explainResponseSchema.safeParse(decoded)
    if (!validatedOutput.success) return reply(response, 502, { error: 'The explanation provider returned an invalid answer.' })
    return reply(response, 200, validatedOutput.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    return reply(response, 400, { error: message === 'Request body must be valid JSON.' || message === 'Request is too large.' ? message : 'The explanation request could not be completed.' })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`WAITWISE explanation API listening on :${port}`))
