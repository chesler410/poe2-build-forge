import { deflate, inflate } from 'pako'
import type { BuildFile } from '@poe2-build-forge/core'

// Hash format: #b=<base64url(deflate(JSON.stringify(build)))>
// "b=" prefix leaves room to namespace future params without breaking
// older links.
const HASH_KEY = 'b'

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const std = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(std)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodeBuildToHash(build: BuildFile): string {
  const json = JSON.stringify(build)
  const compressed = deflate(new TextEncoder().encode(json))
  return `${HASH_KEY}=${bytesToBase64url(compressed)}`
}

export function decodeHashToBuild(hash: string): BuildFile | null {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash
  if (!trimmed) return null
  const params = new URLSearchParams(trimmed)
  const data = params.get(HASH_KEY)
  if (!data) return null
  try {
    const bytes = base64urlToBytes(data)
    const decompressed = inflate(bytes)
    const json = new TextDecoder().decode(decompressed)
    return JSON.parse(json) as BuildFile
  } catch {
    return null
  }
}

export function buildShareUrl(build: BuildFile): string {
  const hash = encodeBuildToHash(build)
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#${hash}`
}
