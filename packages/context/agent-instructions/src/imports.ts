/**
 * Claude Code compatible `@path` import expansion for instruction files.
 *
 * @module @deepseek-ai/dsh-agent-instructions/imports
 */

import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Reads one import target; `undefined` leaves the `@path` token unexpanded. */
export type ImportReader = (absolutePath: string) => Promise<string | undefined>

/** Expansion inputs shared by every file of one load. */
export interface ImportExpansionOptions {
  /** Maximum nested import hops below the instruction file itself; 0 expands nothing. */
  maxDepth: number
  /** Absolute home directory that `@~/path` resolves against. */
  homeDir: string
  /** Reads an import target under the loader's source cap. */
  read: ImportReader
}

const FENCE = /^\s{0,3}(?:`{3,}|~{3,})/
const TRAILING_PUNCTUATION = /[),.;:]+$/

interface Expansion {
  readonly options: ImportExpansionOptions
  readonly depth: number
  readonly stack: ReadonlySet<string>
  readonly file: string
}

function resolveImportPath(path: string, at: Expansion): string {
  if (path.startsWith('~/')) return join(at.options.homeDir, path.slice(2))
  if (isAbsolute(path)) return path
  return resolve(dirname(at.file), path)
}

async function expandWord(word: string, at: Expansion): Promise<string> {
  const path = word.slice(1).replace(TRAILING_PUNCTUATION, '')
  if (!word.startsWith('@') || path === '') return word
  const target = resolveImportPath(path, at)
  if (at.stack.has(target)) return word
  const content = await at.options.read(target)
  if (content === undefined) return word
  const nested = await expandContent(content, {
    options: at.options,
    depth: at.depth + 1,
    stack: new Set([...at.stack, target]),
    file: target,
  })
  return nested + word.slice(1 + path.length)
}

async function expandProse(prose: string, at: Expansion): Promise<string> {
  // Separators sit at odd indexes, so every even piece is one word or empty.
  const pieces = prose.split(/(\s+)/)
  for (let index = 0; index < pieces.length; index += 2) pieces[index] = await expandWord(pieces[index] as string, at)
  return pieces.join('')
}

async function expandLine(line: string, at: Expansion): Promise<string> {
  if (!line.includes('@')) return line
  // Inline code spans (odd backtick-separated parts) are never expanded.
  const parts = line.split('`')
  for (let index = 0; index < parts.length; index += 2) parts[index] = await expandProse(parts[index] as string, at)
  return parts.join('`')
}

async function expandContent(content: string, at: Expansion): Promise<string> {
  if (at.depth > at.options.maxDepth) return content
  const out: string[] = []
  let fence: string | undefined
  for (const line of content.split('\n')) {
    const opener = FENCE.exec(line)?.[0].trim().charAt(0)
    if (opener !== undefined) {
      fence = fence === undefined ? opener : fence === opener ? undefined : fence
      out.push(line)
    } else {
      out.push(fence === undefined ? await expandLine(line, at) : line)
    }
  }
  return out.join('\n')
}

/**
 * Replace each `@path` import in an instruction file with the imported file's
 * own expanded content, as Claude Code does for CLAUDE.md: a whitespace-separated
 * word starting with `@`, resolved against the importing file's directory
 * (`@~/` against the home directory, absolute paths as written), outside fenced
 * code blocks and inline code spans; trailing `),.;:` stay after the content.
 * Imports nest up to `maxDepth` hops; a cyclic or unreadable import leaves its
 * word unchanged.
 * @param content - the instruction file's text.
 * @param absolutePath - absolute path of that file, the base of relative imports.
 * @param options - depth limit, home directory, and reader.
 * @returns the text with every resolvable import inlined.
 */
export async function expandInstructionImports(
  content: string,
  absolutePath: string,
  options: ImportExpansionOptions,
): Promise<string> {
  return expandContent(content, { options, depth: 1, stack: new Set([absolutePath]), file: absolutePath })
}
