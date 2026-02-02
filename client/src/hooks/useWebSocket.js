import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNotification } from '../contexts/NotificationContext'
import { useTranslation } from 'react-i18next'
import apiClient from '../services/api'

/**
 * Hook para manejar la conexión WebSocket con el servidor
 * Proporciona actualizaciones en tiempo real de vehículos, conexión y mensajes
 * 
 * FLUJOS DE CONEXIÓN:
 * 1. Usuario crea nueva conexión → Al guardar, se intenta conectar automáticamente
 * 2. Usuario presiona "Conectar" en TopBar → Intenta conectar a todas las conexiones (primero la activa)
 * 3. Usuario presiona botón Play en un perfil → Conecta a ese perfil específico
 * 4. Auto-conexión al cargar la app → Intenta conectar a la conexión activa guardada
 * 5. Auto-reconexión tras pérdida → Si la desconexión NO fue manual, reintenta conectar
 * 
 * FLUJOS DE DESCONEXIÓN:
 * 1. Usuario presiona "Desconectar" en TopBar → Desconexión manual, resetea UI, NO auto-reconecta
 * 2. Usuario presiona botón en perfil de conexión → Desconexión manual, NO auto-reconecta
 * 3. Pérdida de conexión no manual → Activa auto-reconexión automática con reintentos
 * 
 * LÓGICA DE AUTO-RECONEXIÓN:
 * - Solo se activa si la desconexión NO fue manual
 * - Espera 8 segundos entre intentos para evitar spam
 * - Prueba todas las conexiones (primero la activa)
 * - Solicita parámetros automáticamente al reconectar
 */
export function useWebSocket() {
  const notify = useNotification()
  const { t } = useTranslation()
  const socketRef = useRef(null)
  const reconnectingRef = useRef(false)
  const lastReconnectAtRef = useRef(0)
  const everConnectedRef = useRef(false)
  const manualDisconnectRef = useRef(false)
  const isMountedRef = useRef(true) // Rastrear si el componente está montado
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
    isMountedRef.current = true // Marcar como montado al iniciar
    
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
    })

    socket.on('disconnect', () => {
      console.log('❌ WebSocket desconectado')
      setIsConnected(false)
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
      // Marcar que hubo al menos una conexión exitosa
      if (status.connected) {
        everConnectedRef.current = true
      }
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
      isMountedRef.current = false // Marcar como desmontado
      everConnectedRef.current = false // Resetear para evitar auto-reconexión en re-montaje
      socket.disconnect()
    }
  }, [])

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
            // En auto-conexión, esperar a que llegue el heartbeat del vehículo
            if (isAutoConnect) {
              console.log('⏳ Esperando heartbeat del vehículo (auto-reconexión)...');
              
              // Esperar hasta 5 segundos para que aparezca el vehículo
              const maxWait = 5000;
              const startTime = Date.now();
              
              while (vehicles.length === 0 && Date.now() - startTime < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 200)); // Check cada 200ms
              }
              
              if (vehicles.length === 0) {
                console.warn('⚠️ No se recibió heartbeat, solicitando parámetros de todas formas...');
              } else {
                console.log(`✅ Heartbeat recibido (${vehicles.length} vehículo(s))`);
              }
            }
            
            console.log('📥 Solicitando parámetros...');
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
   * Intentar auto-reconexión a las conexiones guardadas
   * Prueba primero con la conexión activa, luego con las demás
   */
  const attemptAutoReconnect = useCallback(async () => {
    if (reconnectingRef.current) {
      console.log('⏭️ Reconexión ya en progreso, saltando...');
      return false;
    }
    
    reconnectingRef.current = true;
    
    try {
      const response = await fetch('/api/connections');
      const data = await response.json();

      if (!data.connections || data.connections.length === 0) {
        console.log('⚠️ No hay conexiones guardadas para auto-reconectar');
        return false;
      }

      const connections = data.connections;
      const activeId = data.activeConnectionId;

      // Ordenar: primero la activa, luego las demás
      const ordered = activeId
        ? [connections.find((c) => c.id === activeId), ...connections.filter((c) => c.id !== activeId)]
        : connections;

      // Intentar conectar a cada una hasta que funcione
      for (const connection of ordered) {
        if (!connection) continue;
        
        console.log(`🔄 Intentando auto-reconectar a: ${connection.name}`);
        
        const result = await connectToMavlink(connection, {
          isAutoConnect: true,
          silent: !everConnectedRef.current, // Solo mostrar notificación si ya hubo conexión previa
          requestParams: true // Siempre solicitar parámetros en auto-reconexión
        });
        
        if (result.success) {
          console.log(`✅ Auto-reconexión exitosa a: ${connection.name}`);
          manualDisconnectRef.current = false;
          return true;
        }
      }

      console.log('⚠️ No se pudo auto-reconectar a ninguna conexión');
      if (everConnectedRef.current) {
        notify.warning(t('reconnect.noConnection'));
      }
      return false;
    } catch (error) {
      console.error('❌ Error en auto-reconexión:', error);
      return false;
    } finally {
      reconnectingRef.current = false;
    }
  }, [connectToMavlink, notify, t]);

  // Auto-reconexión cuando se pierde la conexión (no manual)
  // DESHABILITADO - La auto-conexión inicial la maneja TopBar
  // Este useEffect causaba conexiones duplicadas en el montaje
  /*
  useEffect(() => {
    // Solo auto-reconectar si:
    // 1. Ya hubo una conexión previa exitosa (everConnectedRef)
    // 2. No está conectado actualmente
    // 3. No fue desconexión manual
    // 4. No hay reconexión en progreso
    // 5. El componente está montado (no es desmontaje de Strict Mode)
    if (connectionStatus.connected === false && 
        everConnectedRef.current && 
        !reconnectingRef.current && 
        !manualDisconnectRef.current &&
        isMountedRef.current) {
      
      const now = Date.now();
      if (now - lastReconnectAtRef.current < 8000) {
        return; // Evitar reconexiones muy frecuentes
      }
      lastReconnectAtRef.current = now;
      
      console.log('🔄 Detectada desconexión no manual (hubo conexión previa), intentando reconectar...');
      attemptAutoReconnect();
    }
  }, [connectionStatus.connected, attemptAutoReconnect]);
  */

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
