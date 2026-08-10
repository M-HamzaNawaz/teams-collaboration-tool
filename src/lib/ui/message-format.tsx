import React from 'react'

/**
 * Mini-markdown for chat messages (Slack-style composer).
 *
 * Supported, deliberately small:
 *   **bold**   _italic_   ~strike~   `inline code`   ```code blocks```
 *   > quote lines   - bullet lines   1. numbered lines   http(s) links
 *
 * SAFETY: the renderer builds React elements — user text is never parsed as
 * HTML, so there is nothing to inject. The DETECTION side is handled in the
 * messages route: it also scans a formatting-stripped variant, because
 * `0300**123**4567` reads as split digits to the engine but reassembles
 * visually once rendered (stripFormatting closes that).
 */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g
/**
 * Underscore emphasis only counts when the delimiters stand OUTSIDE a word,
 * and not immediately before a file extension. Without those guards a chat
 * used by developers mangles everyday text: `some_var_name` italicised
 * "var", `my_file_name.txt` italicised "file", `__init__.py` underlined
 * "init". Prose like "_important_." still works — the guard only rejects a
 * dot followed by more word characters.
 */
const INLINE_TOKEN_RE =
  /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+\*\*|(?<!\w)__[^_\n]+__(?!\w|\.\w)|(?<!\w)_[^_\n]+_(?!\w|\.\w)|~[^~\n]+~|`[^`\n]+`)/g

/** Remove formatting punctuation so split content re-joins for detect(). */
export function stripFormatting(text: string): string {
  return text
    .replaceAll('```', '')
    .replace(/[*_~`[\]()]/g, '')
    .replace(/^\s*(?:>|-|\d+\.)\s+/gm, '')
}

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let index = 0

  // First split by inline tokens, then linkify plain segments.
  const pieces = text.split(INLINE_TOKEN_RE)
  for (const piece of pieces) {
    if (!piece) continue
    const key = `${keyBase}-${index++}`
    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(piece)
    if (link) {
      // http(s) ONLY — a javascript: or data: href would turn a chat
      // message into a script the reader clicks.
      const safe = /^https?:\/\//i.test(link[2])
      out.push(
        safe ? (
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-a underline underline-offset-2"
          >
            {link[1]}
          </a>
        ) : (
          <span key={key}>{piece}</span>
        ),
      )
    } else if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
      out.push(<strong key={key}>{renderInline(piece.slice(2, -2), key)}</strong>)
    } else if (piece.startsWith('__') && piece.endsWith('__') && piece.length > 4) {
      out.push(<u key={key}>{renderInline(piece.slice(2, -2), key)}</u>)
    } else if (piece.startsWith('_') && piece.endsWith('_') && piece.length > 2) {
      out.push(<em key={key}>{renderInline(piece.slice(1, -1), key)}</em>)
    } else if (piece.startsWith('~') && piece.endsWith('~') && piece.length > 2) {
      out.push(<s key={key}>{renderInline(piece.slice(1, -1), key)}</s>)
    } else if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) {
      out.push(
        <code
          key={key}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {piece.slice(1, -1)}
        </code>,
      )
    } else {
      // Linkify plain text.
      let last = 0
      for (const match of piece.matchAll(URL_RE)) {
        const start = match.index ?? 0
        if (start > last) out.push(piece.slice(last, start))
        out.push(
          <a
            key={`${key}-l${start}`}
            href={match[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-a underline underline-offset-2"
          >
            {match[0]}
          </a>,
        )
        last = start + match[0].length
      }
      if (last < piece.length) out.push(piece.slice(last))
    }
  }
  return out
}

type Block =
  | { kind: 'code'; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; lines: string[] }

function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  // ``` fences first — everything inside is verbatim.
  const segments = text.split(/```/)
  segments.forEach((segment, i) => {
    if (i % 2 === 1) {
      blocks.push({ kind: 'code', text: segment.replace(/^\n|\n$/g, '') })
      return
    }
    // group consecutive line kinds
    for (const line of segment.split('\n')) {
      const quote = line.match(/^\s*>\s?(.*)$/)
      const bullet = line.match(/^\s*-\s+(.*)$/)
      const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
      const last = blocks[blocks.length - 1]
      if (quote) {
        if (last?.kind === 'quote') last.lines.push(quote[1])
        else blocks.push({ kind: 'quote', lines: [quote[1]] })
      } else if (bullet) {
        if (last?.kind === 'ul') last.items.push(bullet[1])
        else blocks.push({ kind: 'ul', items: [bullet[1]] })
      } else if (numbered) {
        if (last?.kind === 'ol') last.items.push(numbered[1])
        else blocks.push({ kind: 'ol', items: [numbered[1]] })
      } else {
        if (last?.kind === 'p') last.lines.push(line)
        else blocks.push({ kind: 'p', lines: [line] })
      }
    }
  })
  return blocks
}

export function FormattedBody(props: { body: string }) {
  const blocks = toBlocks(props.body)
  return (
    <>
      {blocks.map((block, i) => {
        const key = `b${i}`
        switch (block.kind) {
          case 'code':
            return (
              <pre
                key={key}
                className="my-1 overflow-x-auto rounded-lg bg-surface-2 p-2.5 font-mono text-[0.85em] leading-relaxed"
              >
                {block.text}
              </pre>
            )
          case 'quote':
            return (
              <blockquote
                key={key}
                className="my-1 border-l-2 border-brand-a/50 pl-2.5 text-muted"
              >
                {block.lines.map((line, j) => (
                  <p key={j}>{renderInline(line, `${key}-${j}`)}</p>
                ))}
              </blockquote>
            )
          case 'ul':
            return (
              <ul key={key} className="my-1 list-disc pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={key} className="my-1 list-decimal pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            )
          case 'p':
            return block.lines.map((line, j) =>
              line === '' ? (
                <br key={`${key}-${j}`} />
              ) : (
                <p key={`${key}-${j}`} className="whitespace-pre-wrap wrap-break-word">
                  {renderInline(line, `${key}-${j}`)}
                </p>
              ),
            )
        }
      })}
    </>
  )
}
