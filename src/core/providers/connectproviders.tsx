import { WebsocketProvider } from "y-websocket"
import { IndexeddbPersistence } from "y-indexeddb"

export function connectProviders(docId: string, ydoc: any) {

  const indexeddb = new IndexeddbPersistence(docId, ydoc)

  const websocket = new WebsocketProvider(
    "ws://localhost:1234",
    docId,
    ydoc
  )

  return {
    indexeddb,
    webrtc: websocket
  }
}
//indexeddb ensures offline persistent editing
//webrtc for collabs