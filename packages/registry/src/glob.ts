import { readdirSync } from "node:fs"
import path from "node:path"
import fg from "fast-glob"

export interface GlobOptions {
  cwd?: string
  deep?: number
  ignore?: string[]
  dot?: boolean
  absolute?: boolean
  onlyFiles?: boolean
  onlyDirectories?: boolean
  suppressErrors?: boolean
}

// fast-glob accepts `a|b` as top-level alternation.
function expandPatterns(patterns: string | string[]) {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  return list.flatMap((pattern) => {
    const parts: string[] = []
    let depth = 0
    let current = ""
    for (const char of pattern) {
      if (char === "{") depth++
      if (char === "}") depth--
      if (char === "|" && depth === 0) {
        parts.push(current)
        current = ""
      } else {
        current += char
      }
    }
    parts.push(current)
    return parts
  })
}

// Bun.Glob has no ignore or depth option, so walk the tree ourselves: ignored
// directories (e.g. node_modules) are never entered and `deep` bounds the
// walk, then Bun.Glob.match filters each entry.
function globBun(patterns: string | string[], options: GlobOptions) {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const matchers = expandPatterns(patterns).map(
    (pattern) => new Bun.Glob(pattern.replace(/^\.\//, ""))
  )
  const ignores = (options.ignore ?? []).map((pattern) => new Bun.Glob(pattern))
  const onlyDirectories = options.onlyDirectories === true
  const onlyFiles = !onlyDirectories && options.onlyFiles !== false
  const maxDepth = options.deep ?? Infinity
  const results: string[] = []

  const isIgnoredDir = (rel: string) =>
    ignores.some((glob) => glob.match(`${rel}/__x__`) || glob.match(rel))
  const isIgnoredFile = (rel: string) => ignores.some((glob) => glob.match(rel))
  const hidden = (name: string) => name.startsWith(".")

  const walk = (dir: string, rel: string, depth: number) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      // fast-glob always tolerates a missing directory.
      const code = (error as NodeJS.ErrnoException).code
      if (options.suppressErrors || code === "ENOENT" || code === "ENOTDIR") {
        return
      }
      throw error
    }
    for (const entry of entries) {
      if (!options.dot && hidden(entry.name)) continue
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (isIgnoredDir(relPath)) continue
        if (!onlyFiles && matchers.some((glob) => glob.match(relPath))) {
          results.push(relPath)
        }
        if (depth + 1 < maxDepth) {
          walk(path.join(dir, entry.name), relPath, depth + 1)
        }
      } else if (onlyFiles || (!onlyDirectories && !onlyFiles)) {
        if (isIgnoredFile(relPath)) continue
        if (matchers.some((glob) => glob.match(relPath))) {
          results.push(relPath)
        }
      }
    }
  }

  walk(cwd, "", 0)
  results.sort()
  return options.absolute
    ? results.map((entry) => path.join(cwd, entry).split(path.sep).join("/"))
    : results
}

export async function glob(
  patterns: string | string[],
  options: GlobOptions = {}
): Promise<string[]> {
  return typeof Bun !== "undefined"
    ? globBun(patterns, options)
    : fg(patterns, options)
}

export function globSync(
  patterns: string | string[],
  options: GlobOptions = {}
): string[] {
  return typeof Bun !== "undefined"
    ? globBun(patterns, options)
    : fg.sync(patterns, options)
}
