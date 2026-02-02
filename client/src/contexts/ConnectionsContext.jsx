import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useNotification } from './NotificationContext';
import { useTranslation } from 'react-i18next';
import { useWebSocketContext } from './WebSocketContext';
import apiClient from '../services/api';

const ConnectionsContext = createContext(null);

export const useConnections = () => {
  const context = useContext(ConnectionsContext);
  if (!context) {
    throw new Error('useConnections debe usarse dentro de ConnectionsProvider');
  }
  return context;
};

export const ConnectionsProvider = ({ children }) => {
  const notify = useNotification();
  const { t } = useTranslation();
  const { connectionStatus, connectToMavlink } = useWebSocketContext();

  const [connections, setConnections] = useState([]);
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadingRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  
  // Auto-reconexión
  const everConnectedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const lastReconnectAtRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const initializedRef = useRef(false); // Prevenir reconexión durante inicialización

  /**
   * Cargar conexiones desde el backend con retry logic
   */
  const loadConnections = useCallback(async (isRetry = false) => {
    // Evitar múltiples cargas simultáneas
    if (loadingRef.current && !isRetry) {
      console.log('⏭️ Carga ya en progreso, saltando...');
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      const data = await apiClient.getConnections();
      setConnections(data.connections || []);
      setActiveConnectionId(data.activeConnectionId || null);
      retryCountRef.current = 0; // Reset retry count on success
    } catch (error) {
      console.error('Error cargando conexiones:', error);
      
      // Retry logic con exponential backoff
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 5000);
        console.log(`🔄 Reintentando en ${delay}ms (intento ${retryCountRef.current}/${MAX_RETRIES})...`);
        setTimeout(() => loadConnections(true), delay);
        return;
      }
      
      // Solo mostrar error después de todos los reintentos
      notify.error(t('connections.loadError'));
      setConnections([]);
      setActiveConnectionId(null);
      retryCountRef.current = 0;
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [notify, t]);

  /**
   * Guardar conexiones en el backend
   */
  const saveConnectionsToBackend = useCallback(async (connectionsToSave, activeId) => {
    try {
      setSaving(true);
      await apiClient.saveConnections(connectionsToSave, activeId);
      setConnections(connectionsToSave);
      setActiveConnectionId(activeId);
      return { success: true };
    } catch (error) {
      console.error('Error guardando conexiones:', error);
      notify.error(t('connections.saveError'));
      return { success: false, error: error.message };
    } finally {
      setSaving(false);
    }
  }, [notify, t]);

  /**
   * Agregar una nueva conexión
   */
  const addConnection = useCallback(async (connection) => {
    const newConnection = {
      ...connection,
      id: Date.now() // Generar ID único basado en timestamp
    };

    const updatedConnections = [...connections, newConnection];
    const result = await saveConnectionsToBackend(updatedConnections, activeConnectionId);

    if (result.success) {
      notify.success(t('connections.added'));
      return { success: true, connection: newConnection };
    }

    return result;
  }, [connections, activeConnectionId, saveConnectionsToBackend, notify, t]);

  /**
   * Actualizar una conexión existente
   */
  const updateConnection = useCallback(async (connectionId, updates) => {
    const updatedConnections = connections.map(conn =>
      conn.id === connectionId ? { ...conn, ...updates } : conn
    );

    const result = await saveConnectionsToBackend(updatedConnections, activeConnectionId);

    if (result.success) {
      notify.success(t('connections.updated'));
      return { success: true };
    }

    return result;
  }, [connections, activeConnectionId, saveConnectionsToBackend, notify, t]);

  /**
   * Eliminar una conexión
   */
  const deleteConnection = useCallback(async (connectionId) => {
    const updatedConnections = connections.filter(conn => conn.id !== connectionId);
    
    // Si se elimina la conexión activa, desactivar
    const newActiveId = connectionId === activeConnectionId ? null : activeConnectionId;

    const result = await saveConnectionsToBackend(updatedConnections, newActiveId);

    if (result.success) {
      notify.success(t('connections.deleted'));
      return { success: true };
    }

    return result;
  }, [connections, activeConnectionId, saveConnectionsToBackend, notify, t]);

  /**
   * Actualizar solo la conexión activa
   */
  const updateActiveConnection = useCallback(async (connectionId) => {
    try {
      await apiClient.updateActiveConnection(connectionId);
      setActiveConnectionId(connectionId);
      return { success: true };
    } catch (error) {
      console.error('Error actualizando conexión activa:', error);
      return { success: false, error: error.message };
    }
  }, []);

  /**
   * Obtener una conexión por ID
   */
  const getConnection = useCallback((connectionId) => {
    return connections.find(conn => conn.id === connectionId) || null;
  }, [connections]);

  /**
   * Obtener la conexión activa
   */
  const getActiveConnection = useCallback(() => {
    if (!activeConnectionId) return null;
    return connections.find(conn => conn.id === activeConnectionId) || null;
  }, [connections, activeConnectionId]);

  /**
   * Verificar si una conexión está activa
   */
  const isActive = useCallback((connectionId) => {
    return connectionId === activeConnectionId;
  }, [activeConnectionId]);

  // Cargar conexiones al montar
  useEffect(() => {
    loadConnections();
    
    // Marcar como inicializado después de 2 segundos (tiempo para que el cliente se sincronice)
    const timer = setTimeout(() => {
      initializedRef.current = true;
      console.log('✅ ConnectionsContext inicializado, auto-reconexión habilitada');
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [loadConnections]);

  // Auto-reconexión cuando se pierde la conexión (no manual)
  useEffect(() => {
    // Solo auto-reconectar si:
    // 1. El sistema ya se inicializó (no es el montaje inicial)
    // 2. Ya hubo una conexión exitosa previa
    // 3. No está conectado actualmente
    // 4. No fue desconexión manual
    // 5. No hay reconexión en progreso
    // 6. Hay una conexión activa configurada
    if (connectionStatus.connected === false && 
        initializedRef.current &&
        everConnectedRef.current && 
        !manualDisconnectRef.current &&
        !reconnectingRef.current &&
        activeConnectionId !== null) {
      
      // Throttle: evitar reconexiones muy frecuentes
      const now = Date.now();
      if (now - lastReconnectAtRef.current < 8000) {
        return;
      }
      lastReconnectAtRef.current = now;
      
      console.log('🔄 Detectada desconexión no manual, intentando reconectar...');
      attemptAutoReconnect();
    }
  }, [connectionStatus.connected, activeConnectionId]);

  // Función de auto-reconexión
  const attemptAutoReconnect = useCallback(async () => {
    if (reconnectingRef.current) {
      console.log('⏭️ Reconexión ya en progreso');
      return;
    }

    reconnectingRef.current = true;

    try {
      // Intentar reconectar con la conexión activa
      const activeConnection = connections.find(c => c.id === activeConnectionId);
      
      if (!activeConnection) {
        console.warn('⚠️ No hay conexión activa para reconectar');
        reconnectingRef.current = false;
        return;
      }

      console.log(`🔄 Intentando reconectar a: ${activeConnection.name}`);
      
      const result = await connectToMavlink(activeConnection, { 
        isAutoConnect: true, 
        silent: true,
        requestParams: false // No solicitar parámetros en auto-reconexión
      });
      
      if (result.success) {
        console.log(`✅ Reconexión exitosa a: ${activeConnection.name}`);
        notify.success(t('connections.reconnected', { name: activeConnection.name }));
      } else {
        console.warn(`⚠️ Falló reconexión a: ${activeConnection.name}`);
        // Reintentar en 5 segundos
        setTimeout(() => {
          reconnectingRef.current = false;
          attemptAutoReconnect();
        }, 5000);
      }
    } catch (error) {
      console.error('❌ Error en auto-reconexión:', error);
      reconnectingRef.current = false;
    } finally {
      if (connectionStatus.connected) {
        reconnectingRef.current = false;
      }
    }
  }, [connections, activeConnectionId, connectToMavlink, connectionStatus.connected, notify, t]);

  // Marcar cuando hay una conexión exitosa
  useEffect(() => {
    if (connectionStatus.connected) {
      everConnectedRef.current = true;
      manualDisconnectRef.current = false;
    }
  }, [connectionStatus.connected]);

  const value = {
    // Estado
    connections,
    activeConnectionId,
    loading,
    saving,

    // Funciones CRUD
    loadConnections,
    saveConnectionsToBackend,
    addConnection,
    updateConnection,
    deleteConnection,
    updateActiveConnection,

    // Utilidades
    getConnection,
    getActiveConnection,
    isActive,
    
    // Auto-reconexión
    setManualDisconnect: (value) => { manualDisconnectRef.current = value; }
  };

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
};

export default ConnectionsContext;
