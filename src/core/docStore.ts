import { v4 as uuidv4 } from "uuid"

export interface DocMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = "collab-docs"

export function getAllDocs(): DocMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveAllDocs(docs: DocMeta[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
}

export function createDoc(title = "Untitled Document"): DocMeta {
  const doc: DocMeta = {
    id: uuidv4(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const docs = getAllDocs()
  docs.unshift(doc)
  saveAllDocs(docs)
  return doc
}

export function updateDocTitle(id: string, title: string): void {
  const docs = getAllDocs()
  const idx = docs.findIndex((d) => d.id === id)
  if (idx !== -1) {
    docs[idx].title = title
    docs[idx].updatedAt = new Date().toISOString()
    saveAllDocs(docs)
  }
}

/**
 * Called when opening a doc by URL.
 * - If doc already exists locally: just bump updatedAt.
 * - If it's a shared link (not in local store): register with a
 *   placeholder title. The real title will be patched in by the
 *   editor once Yjs syncs via `patchSharedDocTitle`.
 */
export function touchDoc(id: string): void {
  const docs = getAllDocs()
  const idx = docs.findIndex((d) => d.id === id)
  if (idx !== -1) {
    docs[idx].updatedAt = new Date().toISOString()
    saveAllDocs(docs)
  } else {
    const doc: DocMeta = {
      id,
      title: "Shared Document",   // placeholder — patched after Yjs sync
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    docs.unshift(doc)
    saveAllDocs(docs)
  }
}

/**
 * After Yjs syncs on a shared-link open, call this to replace the
 * placeholder title with the real synced title — but only if the
 * local title is still the placeholder (don't overwrite user edits).
 */
export function patchSharedDocTitle(id: string, syncedTitle: string): void {
  const docs = getAllDocs()
  const idx = docs.findIndex((d) => d.id === id)
  if (idx !== -1 && docs[idx].title === "Shared Document") {
    docs[idx].title = syncedTitle
    docs[idx].updatedAt = new Date().toISOString()
    saveAllDocs(docs)
  }
}

export function deleteDoc(id: string): void {
  const docs = getAllDocs().filter((d) => d.id !== id)
  saveAllDocs(docs)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
