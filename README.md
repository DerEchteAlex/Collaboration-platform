# Offline-First Collaborative Document Platform

A local-first document editor built for real-time and offline collaboration — no central server required. Documents sync automatically between peers using CRDT-based conflict resolution, meaning edits from multiple users are merged intelligently without data loss or overwrite conflicts. Built with a Notion-style block editor experience in mind, the platform uses WebRTC for direct peer-to-peer connections and IndexedDB for persistent local storage, so your work is always saved — even when the network isn't there.

---

## Technologies Used

**Frontend**
- React 18 + TypeScript
- TipTap (rich text block editor)
- Yjs (CRDT-based shared data types)
- y-indexeddb (offline persistence)
- y-websocket (real-time sync)
- React Router DOM

**Backend / Signaling**
- Node.js + WebSocket (`ws`)
- y-websocket server (peer coordination)
- Deployed via Render (`render.yaml`)

**Build Tools**
- Vite
- ESLint
- TypeScript compiler (`tsc`)

---

## Features

- **Offline-first editing** — documents are stored locally via IndexedDB and continue to work with zero network dependency
- **Real-time collaboration** — multiple users can edit the same document simultaneously with live cursor presence
- **CRDT-based conflict resolution** — Yjs handles merge conflicts automatically, no last-write-wins data loss
- **Notion-style block editor** — rich text support including bold, italic, underline, text alignment, font family, color, and placeholders
- **Export to DOCX** — documents can be downloaded as Word files via the `docx` + `file-saver` libraries
- **Auto-sync on reconnect** — changes made offline are synced back to peers when the connection is restored
- **No login required** — peer discovery is handled via the signaling server, no account or central auth needed
- **Unique document rooms** — each document session is identified by a UUID, shareable via URL

---

## The Process

The project started as a question: *what does a collaborative editor look like when you remove the server from the equation as much as possible?*

The first step was getting TipTap wired up with Yjs — replacing TipTap's default document model with a Yjs `Y.Doc` as the shared state. This meant every keystroke was no longer just updating React state, but mutating a CRDT that could be synced to any peer.

The signaling server (Node.js + `ws`) came next — its only job is to help peers find each other and exchange WebRTC handshake messages. Once connected, the server steps back and peers communicate directly.

IndexedDB integration via `y-indexeddb` was layered on top so that the Yjs document state persists between sessions. When a user opens a document they've edited before, the local state loads instantly — no server round-trip needed.

The final piece was the UI: building a toolbar with TipTap extensions for formatting, presence cursors so collaborators can see each other in real time, and the DOCX export flow.

---
## How It Works

### System Architecture

![System Architecture]
<img width="1219" height="1290" alt="Image" src="https://github.com/user-attachments/assets/b6db071e-c1c3-4d38-a244-eb19ca9d26e1" />

The app is served as a static site on Render and runs entirely in the browser as a
React app. Every client — whether desktop or mobile — connects to the same React
app shell which is made up of three core components:

- **Dashboard** — lists existing documents and lets you create new ones
- **BlockEditor** — the TipTap-powered rich text editor with toolbar
- **CollabEditor** — handles history, awareness, and presence cursors

All three components share a single **Yjs document (`Y.Doc`)** as their source of
truth. This shared CRDT state holds the ProseMirror content field, a snapshots
array, and the document title — everything that needs to stay in sync across peers.

The `Y.Doc` connects to three providers simultaneously:
- **IndexedDB** — persists the document locally for offline support
- **WebSocket provider** — syncs the document with other peers via the server
- **Awareness** — broadcasts cursor positions and user presence in real time

The Node.js server (`server.js`) running on Render acts as the relay — it hosts one
in-memory Yjs server per room and handles the awareness broadcast protocol.

---

### Sync & Offline Flow

![Sync and Offline Flow]
<img width="119" height="150" alt="Image" src="https://github.com/user-attachments/assets/56b7407e-07f3-48f8-8b1a-e0c15b633ba0" />

This diagram shows exactly what happens at each phase of a collaboration session:

**Phase 1 — Editing**
Each browser runs its own TipTap editor backed by a local `Y.Doc`. Every keystroke
mutates the CRDT, not just React state. The server (y-websocket) broadcasts these
updates to all peers connected to the same room.

**Phase 2 — Local Persistence**
Every change is also written to IndexedDB via `y-indexeddb`. This means the document
is saved locally as you type — no network required to preserve your work.

**Phase 3 — Disconnect**
When the WebSocket disconnects, the client continues editing against its local
`Y.Doc`. The WS status flips to `disconnected` and the in-memory Yjs server on the
other side holds its last known state.

**Phase 4 — Reconnect & Merge**
When the connection is restored, the client sends its full state vector to the server.
The server and client perform a **CRDT merge** — both sides converge to the same
document state automatically, with no manual conflict resolution and zero data loss.
The `IndexedDB` then reloads the restored `Y.Doc` state to keep local storage in sync.

This is what makes the platform truly offline-first: the merge always succeeds
regardless of how long a peer was disconnected or how many edits were made offline.
## What I Learned

**CRDTs are a different way of thinking about data**
Before this project, "conflict resolution" would be either last-write-wins or a human doing manual merges. Using Yjs, I was forced to learn about Conflict-free Replicated Data Types, which means every operation is commutative and idempotent so the order that edits arrive to doesn't matter. This drastically changed my understanding of distributed state.

**WebRTC is harder than it looks**
Getting two peers to connect directly sounds simple until you hit NAT traversal, ICE candidates, and signaling handshakes. Building the WebSocket signaling server to coordinate peer discovery — without it becoming a central point of failure — was genuinely challenging.

**Offline-first is an architecture decision, not a feature**
You can't bolt offline support onto an existing app. It has to be the foundation. Designing local state first and treating sync as a secondary concern flipped my usual mental model of how apps should be built.

**TypeScript in a real project vs tutorials**
Typing Yjs shared types, TipTap extensions, and WebSocket message schemas properly taught me things about TypeScript generics and type narrowing that no tutorial had covered — because real codebases have edge cases tutorials skip.

**Real-time state is not the same as React state**
Managing a shared Yjs document alongside React's component state required understanding when to let Yjs drive updates and when React should, and how to avoid infinite update loops between the two.

**Persistence is a first-class concern**
Integrating `y-indexeddb` made me think carefully about when to load, when to sync, and how to handle a document that exists both locally and remotely in potentially diverged states.

---

## How It Can Be Improved

- **Authentication & rooms** — add user accounts so document access can be controlled and rooms can be private
- **WebRTC direct P2P** — replace the WebSocket relay with full WebRTC data channels to reduce server dependency entirely
- **Presence avatars** — show user profile pictures alongside cursor indicators instead of just colored carets
- **Document listing / dashboard** — currently documents are accessed by UUID; a home screen listing your recent docs would improve UX significantly
- **Mobile support** — the block editor is not optimized for touch/mobile viewports yet
- **CRDT version history** — Yjs supports snapshotting; this could be used to build a full document history and restore feature
- **More export formats** — PDF export alongside DOCX, or copy-to-clipboard as markdown

---

## Running the Project

### Prerequisites
- Node.js v18+
- npm v9+

See `dependencies.txt` for the full list of packages.

### Installation

```bash
# Clone the repo
git clone https://github.com/DerEchteAlex/Collaboration-platform.git
cd Collaboration-platform

# Install dependencies
npm install
```

### Running locally

You need two terminals — one for the signaling server, one for the frontend.

```bash
# Terminal 1 — start the WebSocket signaling server
npm run server

# Terminal 2 — start the frontend dev server
npm run dev
```

Then open `http://localhost:5173` in your browser.

To test collaboration, open the same document URL in two different browser tabs or windows.

### Building for production

```bash
npm run build
npm run preview
```

### Deployment

The signaling server is configured for Render via `render.yaml`. The frontend can be deployed to Vercel as a static site after running `npm run build` but I have uploaded it on render as a static site.

---

### Video Demo

Demo video of collaborative work

https://github.com/user-attachments/assets/b60d22c2-f045-464d-9666-d09f38f40153

Demo Video of Offline-Collab

https://github.com/user-attachments/assets/fd7aaeaa-8708-49e9-8912-6ea9a6118a2e
