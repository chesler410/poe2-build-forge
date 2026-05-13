import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkup } from '../src/markup'

function html(text: string): string {
  return renderToStaticMarkup(<>{renderMarkup(text)}</>)
}

describe('renderMarkup', () => {
  it('passes plain text through unchanged', () => {
    expect(html('hello world')).toContain('hello world')
  })

  it('wraps <bold>{...} in <b>', () => {
    expect(html('<bold>{hi}')).toContain('<b>')
    expect(html('<bold>{hi}')).toContain('hi')
  })

  it('wraps <italics>{...} and <italic>{...} in <i>', () => {
    expect(html('<italics>{hi}')).toContain('<i>')
    expect(html('<italic>{hi}')).toContain('<i>')
  })

  it('wraps <underline>{...} in <u>', () => {
    expect(html('<underline>{warning}')).toContain('<u>')
  })

  it('applies a named-color style for known colors', () => {
    const out = html('<red>{boom}')
    expect(out).toMatch(/style="color:[^"]+"/)
    expect(out).toContain('boom')
  })

  it('applies an arbitrary RGB color', () => {
    const out = html('<rgb(10, 20, 30)>{x}')
    expect(out).toContain('rgb(10, 20, 30)')
    expect(out).toContain('x')
  })

  it('handles nested tags', () => {
    const out = html('<underline>{<red>{Warning}}')
    // Outer <u> wraps an inner styled span containing the text.
    expect(out).toMatch(/<u>.*Warning.*<\/u>/)
    expect(out).toMatch(/color:[^"]+/)
  })

  it('breaks on literal "\\n" sequences', () => {
    expect(html('line one\\nline two')).toContain('<br/>')
  })

  it('breaks on real newline characters', () => {
    expect(html('line one\nline two')).toContain('<br/>')
  })

  it('renders unknown tags as muted literal text', () => {
    const out = html('<mystery>{contents}')
    // The literal "<mystery>" should appear in the rendered output —
    // not stripped, not crashed on. Authors should be able to spot
    // their typos.
    expect(out).toContain('mystery')
    expect(out).toContain('contents')
  })

  it('handles an unclosed tag by rendering the rest as plain text', () => {
    // Pattern: opens but never closes. Should not crash and should
    // surface the unclosed content visibly so the author notices.
    const out = html('plain start <bold>{never closes')
    expect(out).toContain('plain start')
    expect(out).toContain('never closes')
  })

  it('mixes plain text and tagged sections', () => {
    const out = html('before <red>{middle} after')
    expect(out).toContain('before')
    expect(out).toContain('middle')
    expect(out).toContain('after')
  })

  it('returns null for empty input', () => {
    expect(renderMarkup('')).toBeNull()
  })
})
