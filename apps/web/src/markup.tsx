import type { CSSProperties, ReactNode } from 'react'

// Renderer for the `<tag>{text}` markup used inside .build description /
// additional_text fields. Tags can nest: `<underline>{<red>{Warning}}`.
// Unknown tags render as literal text so authors can spot typos.
//
// Supported tags:
//   <bold>{...}, <italics>{...} / <italic>{...}, <underline>{...}
//   <red>{...}, <green>{...}, ...                (named colors below)
//   <rgb(r, g, b)>{...}                          (arbitrary RGB)
//
// Both literal "\n" sequences and actual newline characters break to a
// new visual line.

interface ResolvedTag {
  element: 'b' | 'i' | 'u' | 'span'
  style?: CSSProperties
}

const NAMED_COLORS: Record<string, string> = {
  red: '#dc2626',
  green: '#16a34a',
  blue: '#2563eb',
  yellow: '#eab308',
  orange: '#ea580c',
  purple: '#9333ea',
  cyan: '#06b6d4',
  pink: '#ec4899',
  white: '#ffffff',
  black: '#000000',
  gray: '#6b7280',
  grey: '#6b7280',
  magenta: '#d946ef',
  brown: '#92400e'
}

function resolveTag(name: string): ResolvedTag | null {
  const lower = name.toLowerCase().trim()
  if (lower === 'bold') return { element: 'b' }
  if (lower === 'italics' || lower === 'italic') return { element: 'i' }
  if (lower === 'underline') return { element: 'u' }
  if (lower in NAMED_COLORS) {
    return { element: 'span', style: { color: NAMED_COLORS[lower] } }
  }
  const rgb = lower.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgb) {
    return {
      element: 'span',
      style: { color: `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})` }
    }
  }
  return null
}

function renderText(s: string): ReactNode[] {
  const parts = s.split(/\\n|\n/)
  if (parts.length === 1) return [parts[0]]
  const out: ReactNode[] = []
  parts.forEach((part, idx) => {
    out.push(part)
    if (idx < parts.length - 1) out.push(<br key={`br-${idx}`} />)
  })
  return out
}

export function renderMarkup(text: string): ReactNode {
  if (!text) return null
  return <>{renderMarkupNodes(text)}</>
}

function renderMarkupNodes(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const tagStart = text.indexOf('<', i)
    if (tagStart === -1) {
      nodes.push(<span key={key++}>{renderText(text.slice(i))}</span>)
      break
    }
    if (tagStart > i) {
      nodes.push(<span key={key++}>{renderText(text.slice(i, tagStart))}</span>)
    }
    const closeBracket = text.indexOf('>{', tagStart)
    if (closeBracket === -1) {
      nodes.push(<span key={key++}>{renderText(text.slice(tagStart))}</span>)
      break
    }
    const tagName = text.slice(tagStart + 1, closeBracket)
    const tag = resolveTag(tagName)
    const contentStart = closeBracket + 2
    let depth = 1
    let j = contentStart
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      if (depth > 0) j++
    }
    if (depth > 0) {
      nodes.push(<span key={key++}>{renderText(text.slice(tagStart))}</span>)
      break
    }
    const inner = text.slice(contentStart, j)
    if (tag) {
      const Element = tag.element
      nodes.push(
        <Element key={key++} style={tag.style}>
          {renderMarkupNodes(inner)}
        </Element>
      )
    } else {
      // Unknown tag — surface the literal so authors notice misspellings.
      nodes.push(
        <span key={key++} title={`Unknown tag: ${tagName}`} style={{ opacity: 0.7 }}>
          {renderText(text.slice(tagStart, j + 1))}
        </span>
      )
    }
    i = j + 1
  }
  return nodes
}
