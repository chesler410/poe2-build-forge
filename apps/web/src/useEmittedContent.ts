import { useMemo } from 'react'
import { emitBuildFile, type BuildFile } from '@poe2-build-forge/core'

export function useEmittedContent(build: BuildFile): {
  content: string
  filename: string
  error: string | null
} {
  return useMemo(() => {
    try {
      const { content, filename } = emitBuildFile(build)
      return { content, filename, error: null }
    } catch (err) {
      return {
        content: JSON.stringify(build, null, 2) + '\n',
        filename: build.name ? `${build.name}.build` : 'build.build',
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }, [build])
}
