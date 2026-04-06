#!/usr/bin/env node
/**
 * y-websocket server
 * Run with: node server.js
 * Or:       HOST=localhost PORT=1234 node server.js
 */

import http from "http"
import { WebSocketServer } from "ws"
import * as Y from "yjs"
import * as syncProtocol from "y-protocols/sync"
import * as awarenessProtocol from "y-protocols/awareness"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"
import * as map from "lib0/map"

const HOST = process.env.HOST || "localhost"
const PORT = parseInt(process.env.PORT || "1234")

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1

// ─── Document store ───────────────────────────────────────────────────────────
const docs = new Map()

const getYDoc = (docName) =>
  map.setIfUndefined(docs, docName, () => {
    const doc = new Y.Doc()
    doc.gc = true
    return doc
  })

// ─── Message types (mirrors y-websocket protocol) ────────────────────────────
const messageSync = 0
const messageAwareness = 1

const send = (conn, message) => {
  if (
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) return
  try {
    conn.send(message, (err) => { if (err) console.error("send error", err) })
  } catch (e) {
    console.error("send exception", e)
  }
}

// ─── Connection handler ───────────────────────────────────────────────────────
const setupConnection = (conn, req) => {
  const docName = req.url.slice(1).split("?")[0]
  const doc = getYDoc(docName)

  conn.binaryType = "arraybuffer"

  if (!doc._conns) doc._conns = new Set()
  doc._conns.add(conn)

  conn.on("message", (message) => {
    const encoder = encoding.createEncoder()
    const decoder = decoding.createDecoder(new Uint8Array(message))
    const messageType = decoding.readVarUint(decoder)

    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync)
        syncProtocol.readSyncMessage(decoder, encoder, doc, null)
        if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
        break
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness || (doc.awareness = new awarenessProtocol.Awareness(doc)),
          decoding.readVarUint8Array(decoder),
          conn
        )
        break
      }
    }
  })

  if (!doc.awareness) {
    doc.awareness = new awarenessProtocol.Awareness(doc)
  }

  const awarenessChangeHandler = ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated).concat(removed)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients)
    )
    const message = encoding.toUint8Array(encoder)
    doc._conns.forEach((c) => { if (c !== origin) send(c, message) })
  }

  doc.awareness.on("update", awarenessChangeHandler)

  const updateHandler = (update, origin) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    doc._conns.forEach((c) => { if (c !== origin) send(c, message) })
  }

  doc.on("update", updateHandler)

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  send(conn, encoding.toUint8Array(encoder))

  const awarenessStates = doc.awareness.getStates()
  if (awarenessStates.size > 0) {
    const encoder2 = encoding.createEncoder()
    encoding.writeVarUint(encoder2, messageAwareness)
    encoding.writeVarUint8Array(
      encoder2,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
    )
    send(conn, encoding.toUint8Array(encoder2))
  }

  conn.on("close", () => {
    doc._conns.delete(conn)
    doc.awareness.off("update", awarenessChangeHandler)
    doc.off("update", updateHandler)
    awarenessProtocol.removeAwarenessStates(doc.awareness, [conn], null)
  })
}

// ─── HTTP + WS server ─────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" })
  res.end("y-websocket server running\n")
})

const wss = new WebSocketServer({ server })
wss.on("connection", setupConnection)

server.listen(PORT, HOST, () => {
  console.log(`✅ y-websocket server running on ws://${HOST}:${PORT}`)
})
