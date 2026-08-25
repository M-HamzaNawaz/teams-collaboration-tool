'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { PersonMark } from '@/lib/ui/avatar'
import {
  AtSignIcon,
  BoldIcon,
  CameraIcon,
  CodeBlockIcon,
  CodeIcon,
  FileTextIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  QuoteIcon,
  SendIcon,
  SlashSquareIcon,
  SmileIcon,
  StrikethroughIcon,
  UnderlineIcon,
  VideoIcon,
} from '@/lib/ui/icons'

/**
 * WYSIWYG composer.
 *
 * You see BOLD TEXT while typing, not `**markers**` — the markers were the
 * complaint, and a textarea can never fix that. This is a contenteditable
 * surface; on send it is SERIALISED BACK TO MARKDOWN, so everything
 * downstream is untouched: detect() still scans plain text, the stored body
 * is still plain text, and moderation/audit still show what was typed.
 *
 * Two safety rules that matter here:
 *  - Paste is forced to PLAIN TEXT. Pasting from a web page would otherwise
 *    drop arbitrary HTML into the editor.
 *  - The serialiser only emits constructs it knows. Anything else collapses
 *    to its text, so no markup can ride along to the server.
 */

const BLOCK_TAGS = new Set(['DIV', 'P', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'])

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const inner = Array.from(el.childNodes).map(serializeNode).join('')
  const wrap = (mark: string, close = mark) =>
    inner.trim() ? `${mark}${inner}${close}` : inner

  switch (el.tagName) {
    case 'BR':
      return '\n'
    case 'B':
    case 'STRONG':
      return wrap('**')
    case 'I':
    case 'EM':
      return wrap('_')
    case 'U':
      return wrap('__')
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return wrap('~')
    case 'CODE':
      return wrap('`')
    case 'PRE':
      return `\`\`\`\n${inner}\n\`\`\``
    case 'A': {
      const href = el.getAttribute('href') ?? ''
      return /^https?:\/\//i.test(href) ? `[${inner}](${href})` : inner
    }
    case 'UL':
      return Array.from(el.children)
        .map((li) => `- ${serializeNode(li)}`)
        .join('\n')
    case 'OL':
      return Array.from(el.children)
        .map((li, i) => `${i + 1}. ${serializeNode(li)}`)
        .join('\n')
    case 'BLOCKQUOTE':
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    default:
      return inner
  }
}

/** The editor's DOM → the markdown the rest of the product already speaks. */
export function serializeToMarkdown(root: HTMLElement): string {
  const parts: string[] = []
  for (const child of Array.from(root.childNodes)) {
    const text = serializeNode(child)
    const isBlock =
      child.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAGS.has((child as HTMLElement).tagName)
    if (isBlock || parts.length === 0) parts.push(text)
    else parts[parts.length - 1] += text
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const EMOJI = [
  '😀', '😂', '😊', '😍', '🤔', '😅', '😎', '🙌', '👍', '👎',
  '👏', '🙏', '💪', '🔥', '✨', '🎉', '❤️', '💯', '✅', '❌',
  '⚡', '💡', '📌', '📅', '⏰', '☕', '🍕', '🚀', '🐛', '👀',
]

export function RichComposer(props: {
  placeholder: string
  sending: boolean
  mentions: Array<{ userId: string; name: string }>
  onSend: (markdown: string) => void
  onTyping: () => void
  onAttach: (file: File) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showToolbar, setShowToolbar] = useState(true)
  const [popover, setPopover] = useState<'emoji' | 'attach' | null>(null)
  /** Text typed after a live `@`, or null when the caret is not in one. */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  /**
   * The query Escape dismissed. mentionQuery is a pure reading of the
   * caret, so clearing it does nothing — the keyup right behind Escape
   * reads the same `@token` and reopens. Holding the dismissed VALUE
   * keeps it shut until the token actually changes, which is how every
   * other autocomplete behaves: Escape hides, typing more brings it back.
   */
  const [mentionDismissed, setMentionDismissed] = useState<string | null>(null)
  const [empty, setEmpty] = useState(true)
  const [active, setActive] = useState<Record<string, boolean>>({})

  // Semantic tags (<b>, <i>, <u>) instead of inline styles — the
  // serialiser reads tags, and styleWithCSS defaults to true in some
  // browsers, which would emit <span style="font-weight:bold">.
  useEffect(() => {
    try {
      document.execCommand('styleWithCSS', false, 'false')
    } catch {
      // Older engines: the default already emits tags.
    }
  }, [])

  const syncState = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    setEmpty(el.textContent?.trim() === '' && !el.querySelector('img, li'))
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
      })
    } catch {
      // queryCommandState is best-effort; the buttons still work.
    }
  }, [])

  function exec(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    syncState()
  }

  /** Inline code has no native command — wrap the selection by hand. */
  function toggleCode() {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)

    // Already inside <code>? Unwrap it.
    let node: Node | null = range.commonAncestorContainer
    while (node && node !== el) {
      if ((node as HTMLElement).tagName === 'CODE') {
        const code = node as HTMLElement
        const parent = code.parentNode!
        while (code.firstChild) parent.insertBefore(code.firstChild, code)
        parent.removeChild(code)
        syncState()
        return
      }
      node = node.parentNode
    }

    const code = document.createElement('code')
    code.className = 'rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]'
    try {
      range.surroundContents(code)
    } catch {
      // Selection spans element boundaries — fall back to the text.
      code.textContent = range.toString()
      range.deleteContents()
      range.insertNode(code)
    }
    syncState()
  }

  /**
   * The `@token` the caret currently sits in, or null.
   *
   * Deliberately narrow, because the composer is also where people paste
   * logs and addresses: the `@` must open a word (start of the node, or
   * after whitespace), so `ahmed.k@gmail.com` never opens the picker — and
   * that address is exactly the kind of string detect() is watching for.
   * A query that opens with a space closes it again, so "@ " is not a menu
   * that never goes away.
   */
  function readMentionToken() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return null
    }
    const node = selection.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    if (!editorRef.current?.contains(node)) return null

    const offset = selection.anchorOffset
    const before = (node.textContent ?? '').slice(0, offset)
    const at = before.lastIndexOf('@')
    if (at === -1) return null
    if (at > 0 && !/\s/.test(before[at - 1])) return null

    const query = before.slice(at + 1)
    // A trailing space closes the token: it is how "I am done naming
    // someone" looks, and it is what stops the menu reopening on top of
    // the "@Sarah D. " this just inserted.
    if (query.length > 30 || /^\s|\s$|[\n\r]/.test(query)) return null
    return { node, at, offset, query }
  }

  const syncMention = useCallback(() => {
    const token = readMentionToken()
    setMentionQuery((current) => {
      const next = token ? token.query : null
      if (next !== current) setMentionIndex(0)
      return next
    })
  }, [])

  /** Swap the typed `@query` for the chosen name. */
  function applyMention(person: { name: string }) {
    const token = readMentionToken()
    const el = editorRef.current
    if (!token || !el) return
    el.focus()
    const range = document.createRange()
    range.setStart(token.node, token.at)
    range.setEnd(token.node, token.offset)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // execCommand rather than direct DOM surgery: it replaces the selection
    // AND keeps the editor's native undo stack intact.
    document.execCommand('insertText', false, `@${person.name} `)
    setMentionQuery(null)
    setMentionIndex(0)
    setMentionDismissed(null)
    syncState()
  }

  /**
   * Open the OS picker filtered to one kind of file.
   *
   * A convenience, NOT a restriction: /api/files has no MIME allow-list —
   * it takes anything under the size ceiling — and every OS picker lets you
   * switch back to "All files" anyway. The point is to skip the scrolling,
   * not to enforce a policy the server does not have.
   */
  function pickFile(accept: string, capture?: string) {
    const input = fileInputRef.current
    if (!input) return
    input.accept = accept
    // Left set, `capture` would keep sending every later pick to the camera.
    if (capture) input.setAttribute('capture', capture)
    else input.removeAttribute('capture')
    input.click()
    setPopover(null)
  }

  function insertText(text: string) {
    editorRef.current?.focus()
    document.execCommand('insertText', false, text)
    syncState()
  }

  function addLink() {
    const selection = window.getSelection()
    const selected = selection?.toString() ?? ''
    const url = window.prompt(
      selected ? `Link "${selected}" to:` : 'Paste or type the URL:',
      'https://',
    )
    if (!url || !/^https?:\/\//i.test(url)) return
    if (selected) exec('createLink', url)
    else insertText(url)
  }

  const mentionMatches =
    mentionQuery === null
      ? []
      : props.mentions
          .filter((person) =>
            person.name.toLowerCase().includes(mentionQuery.trim().toLowerCase()),
          )
          .slice(0, 8)
  // No candidates = no menu, so a query nobody matches stops swallowing
  // the Enter key.
  const mentionOpen =
    mentionMatches.length > 0 && mentionQuery !== mentionDismissed

  function send() {
    const el = editorRef.current
    if (!el || props.sending) return
    const markdown = serializeToMarkdown(el)
    if (!markdown) return
    props.onSend(markdown)
    el.innerHTML = ''
    setEmpty(true)
    setPopover(null)
    setMentionQuery(null)
    setMentionDismissed(null)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="pb-safe border-t border-border bg-surface p-3"
    >
      {/* Documents first: this is an agency/client work tool, and it is the
          case that actually comes up. Worth knowing while reading this list —
          file CONTENTS are not scanned in v1 (TECHNICAL_PLAN §10), so a
          number written inside a screenshot goes straight through. The menu
          does not widen that hole, but it does put it one tap closer. */}
      {popover === 'attach' && (
        <div
          role="menu"
          aria-label="Attach a file"
          className="mb-2 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2 sm:max-w-xs"
        >
          {[
            {
              label: 'Document',
              hint: 'PDF, Word, Excel, text, zip',
              Icon: FileTextIcon,
              accept:
                '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.rtf,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,application/zip',
            },
            {
              label: 'Photo or video',
              hint: 'From this device',
              Icon: ImageIcon,
              accept: 'image/*,video/*',
            },
            {
              label: 'Any file',
              hint: 'No filter',
              Icon: PaperclipIcon,
              accept: '',
            },
          ].map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="menuitem"
              onClick={() => pickFile(choice.accept)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover"
            >
              <span className="shrink-0 text-muted">
                <choice.Icon />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{choice.label}</span>
                <span className="block truncate text-xs text-muted">
                  {choice.hint}
                </span>
              </span>
            </button>
          ))}
          {/* Only where a camera is the obvious thing behind this button —
              `capture` is inert on a desktop and would just reopen the same
              picker under a misleading name. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => pickFile('image/*', 'environment')}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover [@media(hover:hover)]:hidden"
          >
            <span className="shrink-0 text-muted">
              <CameraIcon />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm">Take a photo</span>
              <span className="block truncate text-xs text-muted">
                Open the camera
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Above the composer, not below it: the composer is pinned to the
          bottom of the screen, so a list under it would open off-screen. */}
      {mentionOpen && (
        <div
          role="listbox"
          aria-label="People in this group"
          className="mb-2 max-h-56 overflow-y-auto rounded-[10px] border border-border bg-surface shadow-e2 sm:max-w-xs"
        >
          {mentionMatches.map((person, i) => (
            <button
              key={person.userId}
              type="button"
              role="option"
              aria-selected={i === mentionIndex}
              // Keep the caret where it is — a blur here would lose the
              // `@query` range this replaces.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyMention(person)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                i === mentionIndex ? 'bg-hover' : 'hover:bg-hover'
              }`}
            >
              <PersonMark name={person.name} size={24} />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-[10px] border border-border bg-surface focus-within:border-teal-d">
        {/* The row slides open/closed (0fr→1fr) instead of popping — the
            thread above shares this column, so an instant mount made the
            whole conversation jump. inert keeps hidden buttons untabbable. */}
        <div
          inert={!showToolbar}
          className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: showToolbar ? '1fr' : '0fr' }}
        >
          <div className="min-h-0 overflow-hidden">
          {/* One line that scrolls sideways on a phone. flex-wrap folded
              these onto a second row and left `<>` and the code block
              orphaned down there; now the last button sits half-cut at the
              right edge, which is its own "keep going" cue. Desktop has the
              width for the whole set, so it keeps the plain wrapping row. */}
          <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto overscroll-x-contain border-b border-border px-2 py-1 text-muted sm:flex-wrap sm:overflow-x-visible">
            <ToolbarButton label="Bold (Ctrl+B)" active={active.bold} onClick={() => exec('bold')}>
              <BoldIcon />
            </ToolbarButton>
            <ToolbarButton label="Italic (Ctrl+I)" active={active.italic} onClick={() => exec('italic')}>
              <ItalicIcon />
            </ToolbarButton>
            <ToolbarButton label="Underline (Ctrl+U)" active={active.underline} onClick={() => exec('underline')}>
              <UnderlineIcon />
            </ToolbarButton>
            <ToolbarButton label="Strikethrough" active={active.strikeThrough} onClick={() => exec('strikeThrough')}>
              <StrikethroughIcon />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px shrink-0 bg-border" />
            <ToolbarButton label="Insert link" onClick={addLink}>
              <LinkIcon />
            </ToolbarButton>
            <ToolbarButton label="Numbered list" onClick={() => exec('insertOrderedList')}>
              <ListOrderedIcon />
            </ToolbarButton>
            <ToolbarButton label="Bulleted list" onClick={() => exec('insertUnorderedList')}>
              <ListIcon />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px shrink-0 bg-border" />
            <ToolbarButton label="Quote" onClick={() => exec('formatBlock', 'blockquote')}>
              <QuoteIcon />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px shrink-0 bg-border" />
            <ToolbarButton label="Inline code (Ctrl+E)" onClick={toggleCode}>
              <CodeIcon />
            </ToolbarButton>
            <ToolbarButton label="Code block" onClick={() => exec('formatBlock', 'pre')}>
              <CodeBlockIcon />
            </ToolbarButton>
          </div>
          </div>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={props.placeholder}
          data-placeholder={props.placeholder}
          onInput={() => {
            syncState()
            syncMention()
            props.onTyping()
          }}
          onKeyUp={() => {
            syncState()
            syncMention()
          }}
          onMouseUp={() => {
            syncState()
            syncMention()
          }}
          onKeyDown={(e) => {
            // While the picker is up it owns Enter — otherwise choosing a
            // name would send a half-typed message instead.
            if (mentionOpen) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionIndex((i) => {
                  const next = e.key === 'ArrowDown' ? i + 1 : i - 1
                  return (next + mentionMatches.length) % mentionMatches.length
                })
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                applyMention(mentionMatches[mentionIndex])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMentionDismissed(mentionQuery)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
              return
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
              e.preventDefault()
              toggleCode()
            }
            // Ctrl+B/I/U are handled natively by contenteditable.
          }}
          onPaste={(e) => {
            // Plain text only: pasting from a web page must not drop its
            // markup (or its styling) into the message.
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
          }}
          className="composer-editor max-h-40 min-h-10.5 w-full overflow-y-auto px-3.5 py-2.5 text-sm outline-none"
        />

        <div className="flex flex-wrap items-center gap-0.5 px-2 pb-1.5 text-muted">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) props.onAttach(file)
              e.target.value = ''
            }}
          />
          <ToolbarButton
            label="Attach a file"
            active={popover === 'attach'}
            onClick={() => setPopover(popover === 'attach' ? null : 'attach')}
          >
            <PlusIcon />
          </ToolbarButton>
          <ToolbarButton
            label={showToolbar ? 'Hide formatting' : 'Show formatting'}
            active={showToolbar}
            onClick={() => setShowToolbar((v) => !v)}
          >
            <span className="text-[13px] font-semibold underline underline-offset-2">Aa</span>
          </ToolbarButton>
          <ToolbarButton
            label="Emoji"
            active={popover === 'emoji'}
            onClick={() => setPopover(popover === 'emoji' ? null : 'emoji')}
          >
            <SmileIcon />
          </ToolbarButton>
          {/* The picker now follows the caret, so the button's whole job
              is to type the `@` that opens it. */}
          <ToolbarButton
            label="Mention someone"
            active={mentionQuery !== null}
            onClick={() => {
              insertText('@')
              syncMention()
            }}
          >
            <AtSignIcon />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <ToolbarButton label="Video calls arrive in Phase 3" disabled>
            <VideoIcon />
          </ToolbarButton>
          <ToolbarButton label="Voice arrives in Phase 3" disabled>
            <MicIcon />
          </ToolbarButton>
          <ToolbarButton label="Shortcuts arrive later" disabled>
            <SlashSquareIcon />
          </ToolbarButton>
          {/* 40px teal-dark send (JobPulse §4.2) */}
          <button
            type="submit"
            aria-label="Send message"
            disabled={props.sending || empty}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg bg-teal-d text-white shadow-e1 transition-transform enabled:hover:scale-105 disabled:opacity-40"
          >
            {props.sending ? '…' : <SendIcon />}
          </button>
        </div>
      </div>

      {popover === 'emoji' && (
        <div className="mt-2 grid max-w-sm grid-cols-10 gap-1 rounded-[10px] border border-border bg-surface p-2 text-xl shadow-e2">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-lg p-1 hover:bg-surface-2"
              onClick={() => {
                insertText(emoji)
                setPopover(null)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

    </form>
  )
}

function ToolbarButton(props: {
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      // Keep the caret in the editor when a toolbar button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-sm transition-colors ${
        props.active ? 'bg-surface-2 text-foreground' : 'hover:bg-surface-2'
      } disabled:opacity-35`}
    >
      {props.children}
    </button>
  )
}
