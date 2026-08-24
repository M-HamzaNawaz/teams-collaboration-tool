'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { PersonMark } from '@/lib/ui/avatar'
import {
  AtSignIcon,
  BoldIcon,
  CodeBlockIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MicIcon,
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
  const [popover, setPopover] = useState<'emoji' | 'mention' | null>(null)
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

  function send() {
    const el = editorRef.current
    if (!el || props.sending) return
    const markdown = serializeToMarkdown(el)
    if (!markdown) return
    props.onSend(markdown)
    el.innerHTML = ''
    setEmpty(true)
    setPopover(null)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="pb-safe border-t border-border bg-surface p-3"
    >
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
            props.onTyping()
          }}
          onKeyUp={syncState}
          onMouseUp={syncState}
          onKeyDown={(e) => {
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
          <ToolbarButton label="Attach a file" onClick={() => fileInputRef.current?.click()}>
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
          <ToolbarButton
            label="Mention someone"
            active={popover === 'mention'}
            onClick={() => setPopover(popover === 'mention' ? null : 'mention')}
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

      {popover === 'mention' && (
        <div className="mt-2 flex max-w-sm flex-col overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2">
          {props.mentions.map((person) => (
            <button
              key={person.userId}
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
              onClick={() => {
                insertText(`@${person.name} `)
                setPopover(null)
              }}
            >
              <PersonMark name={person.name} size={24} />
              {person.name}
            </button>
          ))}
          {props.mentions.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted">Nobody else here yet.</p>
          )}
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
