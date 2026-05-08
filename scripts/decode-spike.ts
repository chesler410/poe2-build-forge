/**
 * Throwaway spike: fetch a pobb.in build, decode it, dump diagnostics.
 *
 * Hypothesis (from PoE1's Path of Building format):
 *   pobb.in /raw -> URL-safe base64 -> zlib-inflate -> XML
 *
 * Run with:  pnpm spike:decode [buildId]
 *
 * If this works for PoE2 builds, the decode logic moves into packages/core/.
 * If the format diverges (different envelope, different compression, JSON
 * instead of XML, etc.), this script tells us so before we invest in scaffolding.
 */

import { inflate } from 'node:zlib'
import { promisify } from 'node:util'

const inflateAsync = promisify(inflate)

const POBB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchPobbRaw(buildId: string): Promise<string> {
  const url = `https://pobb.in/${buildId}/raw`
  const res = await fetch(url, { headers: { 'User-Agent': POBB_USER_AGENT } })
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`)
  }
  return (await res.text()).trim()
}

function urlSafeBase64ToBuffer(input: string): Buffer {
  const standard = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function detectFormat(text: string): string {
  const head = text.trimStart().slice(0, 64)
  if (head.startsWith('<?xml') || head.startsWith('<')) return 'XML'
  if (head.startsWith('{') || head.startsWith('[')) return 'JSON'
  return `unknown (head: ${JSON.stringify(head)})`
}

async function main() {
  const buildId = process.argv[2] ?? '90pcuxN4XtJG'
  console.log(`[spike] Build ID: ${buildId}`)

  const code = await fetchPobbRaw(buildId)
  console.log(`[spike] Fetched ${code.length} chars of (claimed) base64.`)
  console.log(`[spike] First 80 of base64: ${code.slice(0, 80)}`)

  const compressed = urlSafeBase64ToBuffer(code)
  console.log(`[spike] Decoded to ${compressed.length} bytes.`)
  console.log(
    `[spike] First 4 bytes (hex): ${[...compressed.subarray(0, 4)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')}  (zlib header is 78 9c for default compression)`,
  )

  const decompressed = await inflateAsync(compressed)
  console.log(`[spike] Inflated to ${decompressed.length} bytes.`)

  const text = decompressed.toString('utf8')
  console.log(`[spike] Format detected: ${detectFormat(text)}`)
  console.log(`[spike] Length as UTF-8: ${text.length} chars.`)
  console.log(`[spike] --- FIRST 800 CHARS ---`)
  console.log(text.slice(0, 800))
  console.log(`[spike] --- LAST 200 CHARS ---`)
  console.log(text.slice(-200))
}

main().catch((err) => {
  console.error('[spike] FAILED:', err)
  process.exit(1)
})
