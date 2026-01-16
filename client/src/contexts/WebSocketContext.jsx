import { createContext, useContext } from 'react'
import useWebSocket from '../hooks/useWebSocket'

const WebSocketContext = createContext(null)

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext debe usarse dentro de WebSocketProvider')
  }
  return context
}

export const WebSocketProvider = ({ children }) => {
  const websocket = useWebSocket()

  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  )
}

export default WebSocketContext
