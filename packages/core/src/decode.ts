import pako from 'pako'

/**
 * Decode a Path of Building wire-format export (URL-safe base64 +
 * zlib-deflate) into the underlying XML string.
 *
 * Cross-runtime: uses `atob`, `pako.inflate`, and `TextDecoder` —
 * works in Node 18+ and all modern browsers without polyfills.
 *
 * @param code Raw export string (e.g. the body of pobb.in/<id>/raw).
 * @returns The decoded XML document, typically `<PathOfBuilding2>...`.
 * @throws Error if base64 is malformed or zlib stream is invalid.
 */
export function decodePobCode(code: string): string {
  const standard = code.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)

  const binary = atob(padded)
  const compressed = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    compressed[i] = binary.charCodeAt(i)
  }

  const inflated = pako.inflate(compressed)
  return new TextDecoder('utf-8').decode(inflated)
}
