import * as Y from "yjs"
export function createDocument(docId: string) {
  const ydoc = new Y.Doc()
  const blocks = ydoc.getArray("blocks")
  return {
    ydoc,
    blocks
  }
}
//defines shared document state
//each document is 1 y.doc