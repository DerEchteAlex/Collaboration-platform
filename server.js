const { WebsocketServer } = require('@y/websocket-server')

const wsServer = new WebsocketServer({
  host: 'localhost',
  port: 1234,
})

console.log('✓ WebSocket server running on ws://localhost:1234')
