import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import TextAlign from "@tiptap/extension-text-align"
import Placeholder from "@tiptap/extension-placeholder"
import { TextStyleKit } from "@tiptap/extension-text-style"
import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { IndexeddbPersistence } from "y-indexeddb"
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle,
} from "docx"
import { saveAs } from "file-saver"

import { createDocument } from "../core/ydoc/createdoc"
import { connectProviders } from "../core/providers/connectproviders"
import { useUserIdentity } from "../core/useUserIdentity"
import { touchDoc, updateDocTitle, getAllDocs, patchSharedDocTitle } from "../core/docStore"
import { getTheme, setTheme, type AppTheme } from "./Dashboard"
import "./blockeditor.css"

import alignLeftIcon    from "../logo/left-align.png"
import alignCenterIcon  from "../logo/centre-align.png"
import alignRightIcon   from "../logo/right-align.png"
import alignJustifyIcon from "../logo/justify-align.png"

// ── Types ─────────────────────────────────────────────────────────────────────
interface CollabPeer { clientId: number; name: string; color: string }
type PageLayout = "page" | "flow"
type FontSize = number

const FONT_SIZE_OPTIONS: number[] = Array.from({ length: 31 }, (_, i) => i + 10) // 10–40
const FONT_FAMILIES = [
  { label: "Lora (Serif)",      value: "Lora, serif" },
  { label: "DM Sans",           value: "'DM Sans', sans-serif" },
  { label: "Syne",              value: "Syne, sans-serif" },
  { label: "Georgia",           value: "Georgia, serif" },
  { label: "Courier New",       value: "'Courier New', monospace" },
]
const FONT_COLORS = [
  "#f0f0eb","#ff6b6b","#ffa94d","#ffe066",
  "#69db7c","#74c0fc","#da77f2","#f783ac",
  "#000000","#ffffff",
]

// ── Yjs title ─────────────────────────────────────────────────────────────────
function setYTitle(ydoc: Y.Doc, title: string): void {
  const yTitle = ydoc.getText("title")
  ydoc.transact(() => { yTitle.delete(0, yTitle.length); yTitle.insert(0, title) })
}

// ── DOCX export ───────────────────────────────────────────────────────────────
function parseHtmlToDocxParagraphs(html: string): Paragraph[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const paragraphs: Paragraph[] = []
  const getAlignment = (el: Element): AlignmentType => {
    const a = (el as HTMLElement).style?.textAlign
    if (a === "center") return AlignmentType.CENTER
    if (a === "right")  return AlignmentType.RIGHT
    return AlignmentType.LEFT
  }
  const parseInlineRuns = (el: Element): TextRun[] => {
    const runs: TextRun[] = []
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ""
        if (text) runs.push(new TextRun({ text }))
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element
        const tag = child.tagName.toLowerCase()
        runs.push(new TextRun({
          text: child.textContent || "",
          bold: tag === "strong" || tag === "b",
          italics: tag === "em" || tag === "i",
          underline: tag === "u" ? {} : undefined,
          strike: tag === "s",
        }))
      }
    })
    return runs
  }
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === "h1") paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInlineRuns(el), alignment: getAlignment(el) }))
    else if (tag === "h2") paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInlineRuns(el), alignment: getAlignment(el) }))
    else if (tag === "h3") paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInlineRuns(el), alignment: getAlignment(el) }))
    else if (tag === "ul") el.querySelectorAll("li").forEach(li => paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: parseInlineRuns(li) })))
    else if (tag === "ol") el.querySelectorAll("li").forEach(li => paragraphs.push(new Paragraph({ numbering: { reference: "default-numbering", level: 0 }, children: parseInlineRuns(li) })))
    else if (tag === "blockquote") paragraphs.push(new Paragraph({ children: [new TextRun({ text: el.textContent || "", italics: true })], border: { left: { style: BorderStyle.SINGLE, size: 6, color: "0F9158", space: 8 } }, indent: { left: 360 } }))
    else { const runs = parseInlineRuns(el); paragraphs.push(new Paragraph({ children: runs.length > 0 ? runs : [new TextRun("")], alignment: getAlignment(el) })) }
  })
  return paragraphs
}

async function downloadAsDocx(html: string, filename: string) {
  const paragraphs = parseHtmlToDocxParagraphs(html)
  const docxDoc = new Document({
    numbering: { config: [{ reference: "default-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [{ children: paragraphs }],
  })
  saveAs(await Packer.toBlob(docxDoc), `${filename}.docx`)
}

// ── Version history helpers ───────────────────────────────────────────────────
interface Snapshot {
  timestamp: number
  label: string
  update: string   // base64-encoded Y.Doc state
  author: string
}

function getSnapshots(docId: string): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(`collab-history-${docId}`) || "[]")
  } catch { return [] }
}

function saveSnapshot(docId: string, ydoc: Y.Doc, author: string, label?: string) {
  const update = Y.encodeStateAsUpdate(ydoc)
  const b64 = btoa(String.fromCharCode(...update))
  const snap: Snapshot = {
    timestamp: Date.now(),
    label: label || new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    update: b64,
    author,
  }
  const snaps = getSnapshots(docId)
  snaps.unshift(snap)
  // Keep max 50 snapshots
  const trimmed = snaps.slice(0, 50)
  localStorage.setItem(`collab-history-${docId}`, JSON.stringify(trimmed))
  return snap
}

function restoreSnapshot(docId: string, snap: Snapshot, ydoc: Y.Doc) {
  const binary = Uint8Array.from(atob(snap.update), c => c.charCodeAt(0))
  // Create a clean doc from the snapshot, then apply it
  const tempDoc = new Y.Doc()
  Y.applyUpdate(tempDoc, binary)
  const freshUpdate = Y.encodeStateAsUpdate(tempDoc)
  Y.applyUpdate(ydoc, freshUpdate)
}

// ── CollabEditor ──────────────────────────────────────────────────────────────
function CollabEditor({
  ydoc, provider, focusMode, layout, fontSize, setFontSize, fontFamily,
  showHistory, docId, userName,
}: {
  ydoc: Y.Doc
  provider: WebsocketProvider
  focusMode: boolean
  layout: PageLayout
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
  fontFamily: string
  showHistory: boolean
  docId: string
  userName: string
}) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPalettePos, setColorPalettePos] = useState<{ top: number; left: number } | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => getSnapshots(docId))
  const [previewSnap, setPreviewSnap] = useState<Snapshot | null>(null)
  const colorBtnRef = useRef<HTMLDivElement>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Collaboration.configure({ document: ydoc, field: "prosemirror" }),
      TextStyleKit.configure({
        color: { types: ["textStyle"] },
        fontFamily: { types: ["textStyle"] },
        fontSize: { types: ["textStyle"] },
      }),
    ],
    editorProps: { attributes: { class: "editor-body" } },
  })

  // Auto-snapshot every 2 minutes
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      const snap = saveSnapshot(docId, ydoc, userName)
      setSnapshots(getSnapshots(docId))
    }, 2 * 60 * 1000)
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [docId, ydoc, userName])

  // Also snapshot on mount (captures current state as "initial")
  useEffect(() => {
    setTimeout(() => {
      saveSnapshot(docId, ydoc, userName, "Auto-save")
      setSnapshots(getSnapshots(docId))
    }, 3000)
  }, [])

  // Close color picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorBtnRef.current && !colorBtnRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
        setColorPalettePos(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  if (!editor) return null

  const handleManualSnapshot = () => {
    saveSnapshot(docId, ydoc, userName, "Manual save — " + new Date().toLocaleTimeString())
    setSnapshots(getSnapshots(docId))
  }

  const handleRestore = (snap: Snapshot) => {
    if (confirm(`Restore to version from ${snap.label}? Current content will be overwritten.`)) {
      restoreSnapshot(docId, snap, ydoc)
      setPreviewSnap(null)
    }
  }

  const ToolBtn = ({ label, active, onClick, title: tip }: {
    label: string; active?: boolean; onClick: () => void; title?: string
  }) => (
    <button
      className={`tb-btn ${active ? "tb-btn--active" : ""}`}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={tip}
    >{label}</button>
  )

  const currentColor = editor.getAttributes("textStyle").color || "inherit"

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={`editor-toolbar ${focusMode ? "editor-toolbar--hidden" : ""}`}>

        {/* Heading select */}
        <div className="tb-group">
          <select className="tb-select" onChange={(e) => {
            const v = e.target.value
            if (v === "p") editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: parseInt(v) as 1|2|3 }).run()
          }} value={
            editor.isActive("heading", { level: 1 }) ? "1"
            : editor.isActive("heading", { level: 2 }) ? "2"
            : editor.isActive("heading", { level: 3 }) ? "3" : "p"
          }>
            <option value="p">Paragraph</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
        </div>

        <div className="tb-divider" />

        {/* Font family */}
        <div className="tb-group">
          <select className="tb-select tb-select--font" onChange={(e) => {
            editor.chain().focus().setFontFamily(e.target.value).run()
          }} title="Font family">
            {FONT_FAMILIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Font size */}
        <div className="tb-group">
          <select
            className="tb-select tb-select--size"
            value={(() => {
              const active = editor.getAttributes("textStyle").fontSize
              if (active) return parseInt(active)
              return fontSize
            })()}
            onChange={(e) => {
              const px = Number(e.target.value)
              editor.chain().focus().setFontSize(`${px}px`).run()
              setFontSize(px as FontSize)
            }}
            title="Font size"
          >
            {FONT_SIZE_OPTIONS.map(px => (
              <option key={px} value={px}>{px}px</option>
            ))}
          </select>
        </div>

        <div className="tb-divider" />

        {/* Text style */}
        <div className="tb-group">
          <ToolBtn label="B" active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}      title="Bold" />
          <ToolBtn label="I" active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}    title="Italic" />
          <ToolBtn label="U" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline" />
          <ToolBtn label="S" active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()}    title="Strikethrough" />
        </div>

        <div className="tb-divider" />

        {/* Font colour picker */}
        <div className="tb-group">
          <div className="tb-color-wrap" ref={colorBtnRef}>
            <button
              className="tb-color-btn"
              onMouseDown={(e) => {
                e.preventDefault()
                if (showColorPicker) {
                  setShowColorPicker(false)
                  setColorPalettePos(null)
                } else {
                  const rect = colorBtnRef.current?.getBoundingClientRect()
                  if (rect) setColorPalettePos({ top: rect.bottom + 6, left: rect.left })
                  setShowColorPicker(true)
                }
              }}
              title="Font colour"
            >
              <span className="tb-color-letter" style={{ color: currentColor }}>A</span>
              <span className="tb-color-bar" style={{ background: currentColor === "inherit" ? "var(--text)" : currentColor }} />
            </button>
            {showColorPicker && colorPalettePos && (
              <div
                className="tb-color-palette"
                style={{ position: "fixed", top: colorPalettePos.top, left: colorPalettePos.left }}
              >
                {FONT_COLORS.map(c => (
                  <button
                    key={c}
                    className="tb-color-swatch"
                    style={{ background: c }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      editor.chain().focus().setColor(c).run()
                      setShowColorPicker(false)
                      setColorPalettePos(null)
                    }}
                    title={c}
                  />
                ))}
                <button
                  className="tb-color-swatch tb-color-swatch--reset"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    editor.chain().focus().unsetColor().run()
                    setShowColorPicker(false)
                    setColorPalettePos(null)
                  }}
                  title="Reset colour"
                >↺</button>
              </div>
            )}
          </div>
        </div>

        <div className="tb-divider" />

        {/* Alignment */}
        <div className="tb-group">
          {/* CUSTOM LOGO SLOT — replace the img src with your icon (15×15px) */}
          <button
            className={`tb-btn tb-btn--logo ${editor.isActive({ textAlign: "left" }) ? "tb-btn--active" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("left").run() }}
            title="Align left"
          >
            <img src={alignLeftIcon} width={15} height={15} alt="Left" />
          </button>
          <button
            className={`tb-btn tb-btn--logo ${editor.isActive({ textAlign: "center" }) ? "tb-btn--active" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("center").run() }}
            title="Align center"
          >
            <img src={alignCenterIcon} width={15} height={15} alt="Center" />
          </button>
          <button
            className={`tb-btn tb-btn--logo ${editor.isActive({ textAlign: "right" }) ? "tb-btn--active" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("right").run() }}
            title="Align right"
          >
            <img src={alignRightIcon} width={15} height={15} alt="Right" />
          </button>
          <button
            className={`tb-btn tb-btn--logo ${editor.isActive({ textAlign: "justify" }) ? "tb-btn--active" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign("justify").run() }}
            title="Justify"
          >
            <img src={alignJustifyIcon} width={15} height={15} alt="Justify" />
          </button>
        </div>

        <div className="tb-divider" />

        {/* Lists etc */}
        <div className="tb-group">
          <ToolBtn label="• List"  active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title="Bullet list" />
          <ToolBtn label="1. List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list" />
          <ToolBtn label="Quote"   active={editor.isActive("blockquote")}  onClick={() => editor.chain().focus().toggleBlockquote().run()}  title="Blockquote" />
          <ToolBtn label="Code"    active={editor.isActive("code")}         onClick={() => editor.chain().focus().toggleCode().run()}         title="Inline code" />
        </div>

        <div className="tb-divider" />

        {/* Undo / Redo */}
        <div className="tb-group">
          <ToolBtn label="↩" active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo" />
          <ToolBtn label="↪" active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo" />
        </div>

      </div>

      {/* ── Main area: editor + history panel side by side ───────────────── */}
      <div className="editor-main-row">

        {/* ── Editor content ─────────────────────────────────────────────── */}
        <div className={`editor-content-wrap ${focusMode ? "editor-content-wrap--focus" : ""} editor-content-wrap--${layout}`}>
          <div
            className={`editor-page editor-page--${layout}`}
            style={{ fontSize: `${fontSize}px`, fontFamily }}
          >
            <EditorContent editor={editor} className="editor-content" />
          </div>
        </div>

        {/* ── Version history panel ──────────────────────────────────────── */}
        {showHistory && (
          <aside className="history-panel">
            <div className="history-header">
              <span className="history-title">Version History</span>
              <button className="history-save-btn" onClick={handleManualSnapshot} title="Save current version">
                + Save now
              </button>
            </div>

            <div className="history-group-label">Today</div>

            <div className="history-list">
              {snapshots.length === 0 && (
                <div className="history-empty">No versions yet. Saves every 2 min automatically.</div>
              )}
              {snapshots.map((snap, i) => (
                <div
                  key={snap.timestamp}
                  className={`history-item ${previewSnap?.timestamp === snap.timestamp ? "history-item--active" : ""}`}
                  onClick={() => setPreviewSnap(snap)}
                >
                  <div className="history-item-time">{snap.label}</div>
                  {i === 0 && <div className="history-item-badge">Current</div>}
                  <div className="history-item-author">
                    <span className="history-item-dot" />
                    {snap.author}
                  </div>
                  {previewSnap?.timestamp === snap.timestamp && (
                    <button
                      className="history-restore-btn"
                      onClick={(e) => { e.stopPropagation(); handleRestore(snap) }}
                    >
                      Restore this version
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </>
  )
}

// ── Main shell ────────────────────────────────────────────────────────────────
export default function BlockEditor() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const { user } = useUserIdentity()

  const [ydoc] = useState<Y.Doc>(() => createDocument())
  const [provider, setProvider] = useState<WebsocketProvider | null>(null)
  const [idbProvider, setIdbProvider] = useState<IndexeddbPersistence | null>(null)
  const [status, setStatus] = useState<"loading" | "offline" | "online">("loading")
  const [peers, setPeers] = useState<CollabPeer[]>([])
  const [copied, setCopied] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [layout] = useState<PageLayout>("page")
  const [fontSize, setFontSize] = useState<FontSize>(17)
  const [fontFamily, setFontFamily] = useState(FONT_FAMILIES[0].value)
  const [theme, setThemeState] = useState<AppTheme>(getTheme)
  const downloadRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState(() => {
    if (!docId) return "Untitled"
    const doc = getAllDocs().find((d) => d.id === docId)
    return doc?.title ?? "Untitled Document"
  })
  const [editingTitle, setEditingTitle] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [])

  useEffect(() => {
    if (!docId) return
    touchDoc(docId)
    connectProviders(docId, ydoc).then(({ provider: ws, indexeddbProvider: idb }) => {
      setIdbProvider(idb)
      setProvider(ws)
      ws.on("status", (e: { status: string }) => {
        setStatus(e.status === "connected" ? "online" : "offline")
      })
      const updatePeers = () => {
        const states = ws.awareness.getStates()
        const list: CollabPeer[] = []
        states.forEach((state: any, clientId: number) => {
          if (clientId !== ws.awareness.clientID && state?.user)
            list.push({ clientId, name: state.user.name, color: state.user.color })
        })
        setPeers(list)
      }
      ws.awareness.on("change", updatePeers)
      updatePeers()

      const yTitle = ydoc.getText("title")
      const onTitleSync = () => {
        const synced = yTitle.toString()
        if (synced && synced !== "Shared Document") {
          setTitle(synced)
          patchSharedDocTitle(docId, synced)
        }
      }
      onTitleSync()
      yTitle.observe(onTitleSync)
    })
  }, [docId])

  useEffect(() => {
    return () => { provider?.destroy(); idbProvider?.destroy() }
  }, [provider, idbProvider])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) setShowDownloadMenu(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTitleBlur = () => {
    setEditingTitle(false)
    const newTitle = title || "Untitled Document"
    if (docId) { updateDocTitle(docId, newTitle); setYTitle(ydoc, newTitle) }
  }

  const handleDownload = useCallback(async (format: "docx" | "txt") => {
    const el = document.querySelector(".editor-body")
    if (!el) return
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_") || "document"
    if (format === "docx") await downloadAsDocx(el.innerHTML, safeTitle)
    else { saveAs(new Blob([el.textContent || ""], { type: "text/plain" }), `${safeTitle}.txt`) }
    setShowDownloadMenu(false)
  }, [title])

  const toggleTheme = () => {
    const next: AppTheme = theme === "dark" ? "light" : "dark"
    setTheme(next); setThemeState(next)
  }

  if (!docId) return <div className="editor-error">Invalid document ID</div>

  return (
    <div className="editor-shell">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="editor-topbar">
        <button className="editor-back" onClick={() => navigate("/")} title="Back">←</button>

        {editingTitle ? (
          <input ref={titleRef} className="editor-title-input" value={title}
            onChange={(e) => setTitle(e.target.value)} onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === "Enter") titleRef.current?.blur() }} autoFocus />
        ) : (
          <span className="editor-title" onClick={() => setEditingTitle(true)} title="Click to rename">{title}</span>
        )}

        <span className={`editor-status editor-status--${status}`}>
          {status === "loading" && "⏳ Loading…"}
          {status === "online"  && "● Live"}
          {status === "offline" && "○ Offline"}
        </span>

        <div className="editor-peers">
          {peers.map((p) => (
            <span key={p.clientId} className="editor-peer-avatar" style={{ background: p.color }} title={p.name}>
              {p.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>

        <div className="editor-topbar-actions">

          {/* Page layout — locked to page view, no toggle */}

          {/* History */}
          <button
            className={`editor-action-btn ${showHistory ? "editor-action-btn--active" : ""}`}
            onClick={() => setShowHistory(v => !v)}
            title="Version history"
          >
            🕐 History
          </button>

          {/* Eye / focus mode */}
          <button
            className={`eye-btn ${focusMode ? "eye-btn--active" : ""}`}
            onClick={() => setFocusMode(v => !v)}
            title={focusMode ? "Exit focus mode" : "Focus mode"}
          >
            <span className="eye-btn-icon">👁</span>
            <span className={`eye-btn-slider ${focusMode ? "eye-btn-slider--on" : ""}`} />
          </button>

          {/* Theme toggle */}
          <div className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            <div className={`theme-toggle-track theme-toggle-track--${theme}`}>
              <span className="theme-toggle-icon">🌙</span>
              <span className="theme-toggle-icon">☀️</span>
              <div className={`theme-toggle-thumb theme-toggle-thumb--${theme}`} />
            </div>
          </div>

          <button className="editor-action-btn" onClick={handleShare}>
            {copied ? "✓ Copied!" : "Share"}
          </button>

          <div className="download-wrap" ref={downloadRef}>
            <button className="editor-action-btn editor-action-btn--primary" onClick={() => setShowDownloadMenu(v => !v)}>
              Download ▾
            </button>
            {showDownloadMenu && (
              <div className="download-menu">
                <button onClick={() => handleDownload("docx")}><span>Word Document</span><small>.docx</small></button>
                <button onClick={() => handleDownload("txt")}><span>Plain Text</span><small>.txt</small></button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!provider && (
        <div className="editor-loading">
          <div className="editor-loading-spinner" />
          <span>Loading document…</span>
        </div>
      )}

      {provider && (
        <CollabEditor
          ydoc={ydoc}
          provider={provider}
          focusMode={focusMode}
          layout={layout}
          fontSize={fontSize}
          setFontSize={setFontSize}
          fontFamily={fontFamily}
          showHistory={showHistory}
          docId={docId}
          userName={user.name}
        />
      )}
    </div>
  )
}
