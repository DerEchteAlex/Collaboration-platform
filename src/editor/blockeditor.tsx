import { useEffect, useState } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCursor from "@tiptap/extension-collaboration-cursor"

import { createDocument } from "../core/ydoc/createdoc"
import { connectProviders } from "../core/providers/connectproviders"

export default function BlockEditor() {

  const [ydoc, setYdoc] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)

  useEffect(() => {
    const { ydoc } = createDocument("test-doc")
    const { webrtc } = connectProviders("test-doc", ydoc)

    setYdoc(ydoc)
    setProvider(webrtc)

    return () => {
      webrtc.destroy()
      ydoc.destroy()
    }
  }, [])

  // Do NOT create editor until Yjs exists
  if (!ydoc || !provider) {
    return <div style={{ padding: 20 }}>Connecting...</div>
  }

  return <CollaborativeEditor ydoc={ydoc} provider={provider} />
}

function CollaborativeEditor({ ydoc, provider }: any) {

  const editor = useEditor({
    extensions: [
  StarterKit.configure({
    history: false,
  }),

  Collaboration.configure({
    document: ydoc,
    field: "content",
  }),
],
  })

  if (!editor) return null

  return (
    <EditorContent
      editor={editor}
      style={{
        minHeight: "200px",
        border: "1px solid #ccc",
        padding: "10px",
        borderRadius: "8px",
      }}
    />
  )
}