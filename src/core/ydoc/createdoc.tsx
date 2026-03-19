import * as Y from "yjs"
import { v4 as uuidv4 } from "uuid"

export function createDocument(docId: string) {
  const ydoc = new Y.Doc()
  const blocks = ydoc.getArray("blocks")
  if (blocks.length === 0) {

    const block = new Y.Map()

    block.set("id", uuidv4())
    block.set("type", "paragraph")
    block.set("content", "")

    blocks.push([block])
  }

  return {
    ydoc,
    blocks
  }
}
// Array of blocks in the format of {id: "1", type: "paragraph", content: "Hello"}
//defines shared document state
//each document is 1 y.doc