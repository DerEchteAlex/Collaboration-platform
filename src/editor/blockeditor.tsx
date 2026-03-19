import { useEffect, useState } from "react"
import * as Y from "yjs"
import Block from "./blocks"
import { createDocument } from "../core/ydoc/createdoc"
import { connectProviders } from "../core/providers/connectproviders"

export default function BlockEditor() {

  const [yBlocks, setYBlocks] = useState<any>(null)
  const [blocks, setBlocks] = useState<any[]>([])

useEffect(() => {

  const { ydoc, blocks: yArray } = createDocument("test-doc")
  const { webrtc } = connectProviders("test-doc", ydoc)

  ;(window as any).yBlocks = yArray
  const raw = yArray.toArray()

const seenIds = new Set()

raw.forEach((item: any, index: number) => {

  let id = item.id

  if (!id || seenIds.has(id)) {
    id = crypto.randomUUID()
  }

  seenIds.add(id)
  if (!(item instanceof Y.Map)) {

    const newBlock = new Y.Map()

    newBlock.set("id", id)
    newBlock.set("type", item.type || "paragraph")
    newBlock.set("content", item.content || "")

    yArray.delete(index, 1)
    yArray.insert(index, [newBlock])
  }
  else {
    if (seenIds.has(item.get("id"))) {
      item.set("id", crypto.randomUUID())
    } else {
      seenIds.add(item.get("id"))
    }
  }

})
  const update = () => {

    const cleanBlocks = yArray.toArray().filter(
      (b: any) => b instanceof Y.Map
    )
    setBlocks(cleanBlocks)
  }

  yArray.observe(update)
  update()

  setYBlocks(yArray)

  return () => {
    yArray.unobserve(update)
    webrtc.destroy()
    ydoc.destroy()
  }

}, [])

  if (!yBlocks) {
    return <div style={{ padding: 20 }}>Connecting...</div>
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Offline Collaborative Blocks</h2>
      {blocks.map((block: any, index: number) => {
      if (!block || typeof block.get !== "function") {
        console.warn("Invalid block detected:", block)
        return null
      }

  return (
    <Block
      key={block.get("id") + "_" + index}
      block={block}
      yBlocks={yBlocks}
    />
  )
})}

    </div>
  )
}