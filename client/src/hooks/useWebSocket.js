import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNotification } from '../contexts/NotificationContext'
import { useTranslation } from 'react-i18next'
import apiClient from '../services/api'

/**
 * Hook para manejar la conexión WebSocket con el servidor
 * Proporciona actualizaciones en tiempo real de vehículos, conexión y mensajes
 */
export function useWebSocket() {
  const notify = useNotification()
  const { t } = useTranslation()
  const socketRef = useRef(null)
  const reconnectingRef = useRef(false)
  const lastReconnectAtRef = useRef(0)
  const everConnectedRef = useRef(false)
  const manualDisconnectRef = useRef(false)
  const [isConnected, setIsConnected] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [connectionStatus, setConnectionStatus] = useState({ connected: false })
  const [messages, setMessages] = useState([])
  const [parametersProgress, setParametersProgress] = useState({
    count: 0,
    received: 0,
    complete: false,
    progress: 0
  })

  // Vehículo seleccionado (por defecto el primero o null)
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)

  // Obtener vehículo seleccionado actual
  const selectedVehicle = vehicles.find(v => v.systemId === selectedVehicleId) || vehicles[0] || null

  const attemptReconnect = useCallback(async ({ silent = false } = {}) => {
    if (reconnectingRef.current) return false
    
    // No intentar reconectar si fue desconexión manual
    if (manualDisconnectRef.current) return false

    const now = Date.now()
    if (now - lastReconnectAtRef.current < 8000) {
      return false
    }
    lastReconnectAtRef.current = now

    reconnectingRef.current = true

    try {
      const response = await fetch('/api/connections')
      const data = await response.json()

      if (!data.connections || data.connections.length === 0) {
        if (!silent) notify.warning(t('reconnect.noSavedConnections'))
        return false
      }

      const connections = data.connections
      const activeId = data.activeConnectionId

      const ordered = activeId
        ? [connections.find((c) => c.id === activeId), ...connections.filter((c) => c.id !== activeId)]
        : connections

      for (const connection of ordered) {
        if (!connection) continue
        try {
          const response = await fetch('/api/mavlink/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: connection.type, config: connection.config })
          })
          const result = await response.json()
          if (result.success) {
            // Guardar en backend la conexión activa
            await fetch('/api/connections/active', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ activeConnectionId: connection.id })
            })
            if (!silent) notify.info(t('reconnect.reconnectedWith', { name: connection.name }))
            reconnectingRef.current = false
            manualDisconnectRef.current = false
            return true
          }
        } catch (error) {
          // probar siguiente
          continue
        }
      }

      if (!silent) notify.warning(t('reconnect.noConnection'))
      return false
    } finally {
      reconnectingRef.current = false
    }
  }, [notify])

  // Auto-seleccionar vehículo cuando cambia la lista
  useEffect(() => {
    if (!selectedVehicleId && vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].systemId)
    }
    
    // Si el vehículo seleccionado ya no existe, seleccionar el primero
    if (selectedVehicleId && !vehicles.find(v => v.systemId === selectedVehicleId)) {
      setSelectedVehicleId(vehicles.length > 0 ? vehicles[0].systemId : null)
    }
  }, [vehicles, selectedVehicleId])

  useEffect(() => {
    // Conectar al WebSocket del servidor
    // En desarrollo: usa localhost:3000
    // En producción: usa variable de entorno o construye URL con puerto 3000
    let serverUrl
    if (import.meta.env.PROD) {
      // Si hay una variable de entorno definida, usarla
      if (import.meta.env.VITE_BACKEND_URL) {
        serverUrl = import.meta.env.VITE_BACKEND_URL
      } else {
        // En producción, usar el mismo host pero puerto 3000
        const hostname = window.location.hostname
        const protocol = window.location.protocol
        serverUrl = `${protocol}//${hostname}:3000`
      }
    } else {
      serverUrl = 'http://localhost:3000'
    }
    
    console.log('🔌 Conectando WebSocket a:', serverUrl)
    
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    })

    socketRef.current = socket

    // Eventos de conexión
    socket.on('connect', () => {
      console.log('✅ WebSocket conectado')
      setIsConnected(true)
      everConnectedRef.current = true
    })

    socket.on('disconnect', () => {
      console.log('❌ WebSocket desconectado')
      setIsConnected(false)
      // Solo notificar intentos de reconexión si ya hubo una conexión previa
      attemptReconnect({ silent: !everConnectedRef.current })
    })

    socket.on('connect_error', (error) => {
      console.error('❌ Error de conexión WebSocket:', error.message)
    })

    // Eventos de datos en tiempo real
    socket.on('vehicles_update', (vehiclesData) => {
      setVehicles(vehiclesData)
    })

    socket.on('connection_status', (status) => {
      setConnectionStatus(status)
    })

    socket.on('system_message', (message) => {
      setMessages(prev => [message, ...prev].slice(0, 100)) // Mantener últimos 100
    })

    socket.on('parameters_update', (progress) => {
      setParametersProgress(progress)
    })

    // Cleanup
    return () => {
      console.log('🔌 Desconectando WebSocket')
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    // No intentar reconectar si fue desconexión manual
    if (connectionStatus.connected === false && !reconnectingRef.current && !manualDisconnectRef.current) {
      attemptReconnect({ silent: !everConnectedRef.current })
    }
  }, [connectionStatus.connected, attemptReconnect])

  // Emitir evento al servidor (para futuros comandos)
  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('WebSocket no conectado, no se puede emitir:', event)
    }
  }, [])

  // Función para marcar desconexión manual (detiene auto-reconnect)
  const markManualDisconnect = useCallback(() => {
    manualDisconnectRef.current = true
    // Limpiar estado inmediatamente
    setVehicles([])
    setSelectedVehicleId(null)
    setMessages([])
    setParametersProgress({
      count: 0,
      received: 0,
      complete: false,
      progress: 0
    })
  }, [])

  // Función para reactivar auto-reconnect (al conectar manualmente)
  const enableAutoReconnect = useCallback(() => {
    manualDisconnectRef.current = false
  }, [])

  // ==================== Funciones Centralizadas de Conexión ====================

  /**
   * Conectar a MAVLink de forma centralizada
   * @param {object} connection - Objeto de conexión con { id, name, type, config }
   * @param {object} options - Opciones: { isAutoConnect, silent, requestParams }
   */
  const connectToMavlink = useCallback(async (connection, options = {}) => {
    const { 
      isAutoConnect = false, 
      silent = false, 
      requestParams = true 
    } = options;

    try {
      // Conectar a MAVLink
      const result = await apiClient.connectMAVLink(connection.type, connection.config);

      if (result.success) {
        // Actualizar conexión activa en backend
        await apiClient.updateActiveConnection(connection.id);

        // Reactivar auto-reconnect
        enableAutoReconnect();

        // Mostrar notificación
        if (!silent) {
          if (isAutoConnect) {
            notify.info(t('reconnect.reconnectedWith', { name: connection.name }));
          } else {
            notify.success(t('connected'));
          }
        }

        // Solicitar parámetros si no es servidor TCP
        const isTcpServer = connection.type === 'tcp' && connection.config.mode === 'Servidor';
        if (requestParams && !isTcpServer) {
          try {
            await apiClient.requestParameters();
          } catch (paramError) {
            console.warn('No se pudieron solicitar parámetros:', paramError);
          }
        }

        return { success: true };
      } else {
        if (!silent) {
          notify.error(result.message || t('connectionError'));
        }
        return { success: false, message: result.message };
      }
    } catch (error) {
      console.error('Error conectando a MAVLink:', error);
      if (!silent) {
        notify.error(error.message || t('connectionError'));
      }
      return { success: false, error: error.message };
    }
  }, [notify, t, enableAutoReconnect]);

  /**
   * Desconectar de MAVLink de forma centralizada
   * @param {object} options - Opciones: { silent }
   */
  const disconnectFromMavlink = useCallback(async (options = {}) => {
    const { silent = false } = options;

    try {
      // Marcar desconexión manual (detiene auto-reconnect)
      markManualDisconnect();

      // Desconectar del backend
      const result = await apiClient.disconnectMAVLink();

      if (!silent) {
        if (result.success) {
          notify.success(t('disconnected'));
        } else {
          notify.warning(result.message || t('disconnectionError'));
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error desconectando de MAVLink:', error);
      if (!silent) {
        notify.error(error.message || t('disconnectionError'));
      }
      return { success: false, error: error.message };
    }
  }, [notify, t, markManualDisconnect]);

  return {
    isConnected,
    vehicles,
    selectedVehicle,
    selectedVehicleId,
    setSelectedVehicleId,
    connectionStatus,
    messages,
    parametersProgress,
    emit,
    markManualDisconnect,
    enableAutoReconnect,
    // Nuevas funciones centralizadas
    connectToMavlink,
    disconnectFromMavlink
  }
}

export default useWebSocket
