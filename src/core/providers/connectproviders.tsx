import * as Y from "yjs"
import { WebsocketProvider } from "y-websocket"
import { IndexeddbPersistence } from "y-indexeddb"

export interface ConnectedProviders {
  provider: WebsocketProvider
  indexeddbProvider: IndexeddbPersistence
}

/**
 * Connects both IndexedDB (offline) and WebSocket (online) providers to a Y.Doc.
 * Returns a Promise that resolves AFTER IndexedDB has finished loading local data,
 * ensuring Tiptap always initialises with the correct document state.
 */
export function connectProviders(
  docId: string,
  ydoc: Y.Doc
): Promise<ConnectedProviders> {
  return new Promise((resolve) => {

    const indexeddbProvider = new IndexeddbPersistence(docId, ydoc)

    indexeddbProvider.whenSynced.then(() => {
      console.log("Offline data loaded")

      const websocketProvider = new WebsocketProvider(
        "https://collaboration-platform-3xkd.onrender.com",
        docId,
        ydoc,
        { connect: true }
      )

      const storedUser = localStorage.getItem("collab-user")
      const user = storedUser
        ? JSON.parse(storedUser)
        : {
            name: "User " + Math.floor(Math.random() * 900 + 100),
            color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
          }

      if (!storedUser) {
        localStorage.setItem("collab-user", JSON.stringify(user))
      }

      websocketProvider.awareness.setLocalStateField("user", user)

      websocketProvider.on("status", (e: { status: string }) => {
        console.log("WS STATUS:", e.status)
      })

      websocketProvider.on("sync", (isSynced: boolean) => {
        console.log("SYNC STATUS:", isSynced)
      })

      console.log("ROOM CONNECTED:", docId)

      resolve({ provider: websocketProvider, indexeddbProvider })
    })
  })
}
