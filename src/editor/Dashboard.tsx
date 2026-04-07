import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  getAllDocs,
  createDoc,
  deleteDoc,
  formatDate,
  type DocMeta,
} from "../core/docStore"
import { useUserIdentity } from "../core/useUserIdentity"
import "./dashboard.css"
import spiderLogo from "../logo/spiderlogo.png"

// ── Theme stored in localStorage so editor inherits it ────────────────────────
export type AppTheme = "dark" | "light"

export function getTheme(): AppTheme {
  return (localStorage.getItem("collab-theme") as AppTheme) || "dark"
}

export function setTheme(theme: AppTheme) {
  localStorage.setItem("collab-theme", theme)
  document.documentElement.setAttribute("data-theme", theme)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [search, setSearch] = useState("")
  const [showProfile, setShowProfile] = useState(false)
  const [editName, setEditName] = useState("")
  const [theme, setThemeState] = useState<AppTheme>(getTheme)
  const { user, setUser } = useUserIdentity()

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      || Object.assign(document.createElement("link"), { rel: "icon" })
    link.type = "image/png"
    link.href = spiderLogo
    document.head.appendChild(link)
  }, [])

  useEffect(() => {
    setDocs(getAllDocs())
  }, [])

  const handleCreate = () => {
    const doc = createDoc()
    navigate(`/doc/${doc.id}`)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm("Delete this document?")) {
      deleteDoc(id)
      setDocs(getAllDocs())
    }
  }

  const handleOpenProfile = () => {
    setEditName(user.name)
    setShowProfile(true)
  }

  const handleSaveProfile = () => {
    if (editName.trim()) {
      setUser({ ...user, name: editName.trim() })
    }
    setShowProfile(false)
  }

  const toggleTheme = () => {
    const next: AppTheme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    setThemeState(next)
  }

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="dash">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-brand">
          <img src={spiderLogo} className="dash-logo" alt="Spider logo" />
          <span className="dash-brand-name">Offline Collab Platform</span>
        </div>

        <div className="dash-header-right">
          {/* Theme toggle pill */}
          <div className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            <div className={`theme-toggle-track theme-toggle-track--${theme}`}>
              <span className="theme-toggle-icon theme-toggle-icon--dark">☾</span>
              <span className="theme-toggle-icon theme-toggle-icon--light">☀</span>
              <div className={`theme-toggle-thumb theme-toggle-thumb--${theme}`} />
            </div>
          </div>

          {/* Avatar */}
          <button
            className="dash-avatar"
            style={{ background: user.color }}
            onClick={handleOpenProfile}
            title="Edit profile"
          >
            {user.name.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="dash-hero">
        <h1 className="dash-title">Your Documents</h1>
        <p className="dash-subtitle">Work Offline</p>

        <div className="dash-search-wrap">
          <span className="dash-search-icon">⌕</span>
          <input
            className="dash-search"
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <main className="dash-grid-wrap">
        {/* Create card */}
        <button className="dash-card dash-card--new" onClick={handleCreate}>
          <span className="dash-card-plus">+</span>
          <span className="dash-card-new-label">New Document</span>
        </button>

        {filtered.length === 0 && search && (
          <div className="dash-empty">No documents match "{search}"</div>
        )}

        {filtered.map((doc) => (
          <button
            key={doc.id}
            className="dash-card dash-card--doc"
            onClick={() => navigate(`/doc/${doc.id}`)}
          >
            <div className="dash-card-inner">
              <div className="dash-card-preview">
                <div className="dash-card-lines">
                  <span /><span /><span /><span />
                </div>
              </div>
              <div className="dash-card-meta">
                <span className="dash-card-title">{doc.title}</span>
                <span className="dash-card-date">{formatDate(doc.updatedAt)}</span>
              </div>
            </div>
            <button
              className="dash-card-delete"
              onClick={(e) => handleDelete(e, doc.id)}
              title="Delete"
            >
              ×
            </button>
          </button>
        ))}
      </main>

      {/* ── Profile modal ──────────────────────────────────────────────── */}
      {showProfile && (
        <div className="modal-backdrop" onClick={() => setShowProfile(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Your Profile</h2>

            <div className="modal-avatar" style={{ background: user.color }}>
              {editName.charAt(0).toUpperCase() || "?"}
            </div>

            <label className="modal-label">Display name</label>
            <input
              className="modal-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
              autoFocus
            />

            <label className="modal-label">Cursor color</label>
            <div className="modal-colors">
              {[
                "#e74c3c","#FFAEC9","#FF7F27","#f1c40f","#B5E61D",
                "#22B14C","#00A2E8","#3F48CC","#A349A4",
              ].map((c) => (
                <button
                  key={c}
                  className={`modal-color-swatch ${user.color === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setUser({ ...user, color: c })}
                />
              ))}
            </div>

            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowProfile(false)}>
                Cancel
              </button>
              <button className="modal-save" onClick={handleSaveProfile}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
