import * as Y from "yjs"

/**
 * Creates and returns a new shared Yjs document.
 * The "prosemirror" XmlFragment is required by @tiptap/extension-collaboration.
 */
export function createDocument(): Y.Doc {
  const ydoc = new Y.Doc()
  ydoc.getXmlFragment("prosemirror")
  console.log("Y.Doc created")
  return ydoc
}
