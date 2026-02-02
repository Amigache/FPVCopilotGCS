import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNotification } from './NotificationContext'
import { useWebSocketContext } from './WebSocketContext'

const ParametersContext = createContext(null)

/**
 * Hook para acceder a los parámetros del vehículo desde cualquier componente
 * 
 * Características:
 * - Caché compartido entre todos los componentes
 * - Evita fetches duplicados (caché de 30 segundos)
 * - Actualización optimista (UI actualiza inmediatamente)
 * - Sincronización automática entre componentes
 * 
 * @example
 * const { parameters, loading, loadParameters, setParameter, getParameter } = useParameters()
 * 
 * // Obtener un parámetro
 * const fltmode1 = getParameter('FLTMODE1')
 * 
 * // Actualizar un parámetro
 * await setParameter('FLTMODE1', 5)
 */
export const useParameters = () => {
  const context = useContext(ParametersContext)
  if (!context) {
    throw new Error('useParameters debe usarse dentro de ParametersProvider')
  }
  return context
}

export const ParametersProvider = ({ children }) => {
  const notify = useNotification()
  const websocket = useWebSocketContext()
  
  // Estado de parámetros
  const [parameters, setParameters] = useState(new Map())
  const [updateCounter, setUpdateCounter] = useState(0) // Contador para forzar re-render
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total: 0, received: 0, complete: false })
  const [isConnected, setIsConnected] = useState(false)
  
  // Control de caché
  const lastLoadTime = useRef(null)
  const loadingRef = useRef(false)
  const CACHE_DURATION = 30000 // 30 segundos

  /**
   * Escuchar actualizaciones de progreso de descarga desde WebSocket
   */
  useEffect(() => {
    if (websocket.parametersProgress) {
      setStats({
        total: websocket.parametersProgress.count || 0,
        received: websocket.parametersProgress.received || 0,
        complete: websocket.parametersProgress.complete || false
      })
    }
  }, [websocket.parametersProgress])

  /**
   * Cargar parámetros desde el servidor
   * @param {boolean} force - Forzar recarga ignorando caché
   */
  const loadParameters = useCallback(async (force = false) => {
    // Evitar llamadas simultáneas
    if (loadingRef.current && !force) {
      return parameters
    }

    // Verificar caché (solo si no es forzado)
    if (!force && lastLoadTime.current) {
      const timeSinceLastLoad = Date.now() - lastLoadTime.current
      if (timeSinceLastLoad < CACHE_DURATION) {
        return parameters
      }
    }

    loadingRef.current = true
    setLoading(true)

    try {
      // Verificar conexión
      const statusResponse = await fetch('/api/mavlink/parameters/status')
      const statusData = await statusResponse.json()
      
      // Considerar como conectado si hay total de parámetros (indicador de que hubo comunicación)
      const isReallyConnected = statusData.connected || statusData.total > 0
      setIsConnected(isReallyConnected)

      if (!isReallyConnected && statusData.total === 0) {
        setParameters(new Map())
        setStats({ total: 0, received: 0, complete: false })
        setLoading(false)
        loadingRef.current = false
        return new Map()
      }

      // Cargar parámetros
      const response = await fetch('/api/mavlink/parameters')
      const data = await response.json()

      // Convertir array a Map para acceso O(1)
      const paramsMap = new Map()
      if (data.parameters && Array.isArray(data.parameters)) {
        data.parameters.forEach(param => {
          paramsMap.set(param.name, {
            value: param.value,
            type: param.type
          })
        })
      }

      setParameters(paramsMap)
      setStats({
        total: data.total || 0,
        received: data.received || 0,
        complete: data.complete || false
      })

      lastLoadTime.current = Date.now()

      return paramsMap
    } catch (error) {
      console.error('Error cargando parámetros:', error)
      notify.error(t('parameters.modals.loadError'))
      return new Map()
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [parameters, notify])

  /**
   * Obtener un parámetro específico
   * @param {string} name - Nombre del parámetro
   * @returns {number|null} Valor del parámetro o null si no existe
   */
  const getParameter = useCallback((name) => {
    const param = parameters.get(name)
    return param ? param.value : null
  }, [parameters])

  /**
   * Obtener múltiples parámetros que coincidan con un patrón
   * @param {string|RegExp} pattern - Patrón de búsqueda
   * @returns {Map} Mapa con los parámetros que coinciden
   */
  const getParametersByPattern = useCallback((pattern) => {
    const result = new Map()
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
    
    parameters.forEach((param, key) => {
      if (regex.test(key)) {
        result.set(key, param.value)
      }
    })
    
    return result
  }, [parameters])

  /**
   * Obtener todos los parámetros como array
   * @returns {Array} Array de objetos {name, value, type}
   */
  const getAllParameters = useCallback(() => {
    const result = []
    parameters.forEach((param, name) => {
      result.push({ name, value: param.value, type: param.type })
    })
    return result
  }, [parameters])

  /**
   * Actualizar un parámetro en el vehículo
   * @param {string} name - Nombre del parámetro
   * @param {number} value - Nuevo valor
   * @returns {Promise<boolean>} true si se actualizó correctamente
   */
  const setParameter = useCallback(async (name, value) => {
    try {
      const previousValue = parameters.get(name)

      // Actualización optimista (actualizar UI inmediatamente)
      setParameters(prev => {
        const updated = new Map(prev)
        const existingParam = prev.get(name)
        const newValue = parseFloat(value)
        updated.set(name, {
          value: newValue,
          type: existingParam ? existingParam.type : 'REAL32'
        })
        return updated
      })
      setUpdateCounter(prev => prev + 1)

      // Enviar al servidor
      const response = await fetch('/api/mavlink/parameters/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value: parseFloat(value) })
      })

      const result = await response.json()

      if (!result.success) {
        // Revertir si falló
        setParameters(prev => {
          const reverted = new Map(prev)
          if (previousValue !== undefined) {
            reverted.set(name, previousValue)
          } else {
            reverted.delete(name)
          }
          return reverted
        })
        notify.error(`Error al actualizar ${name}`)
        return { success: false, message: result.message }
      }

      // Actualizar con el valor confirmado del servidor
      if (result.value !== undefined) {
        setParameters(prev => {
          const updated = new Map(prev)
          const existingParam = prev.get(name)
          updated.set(name, {
            value: result.value, // Usar el valor confirmado del servidor
            type: existingParam ? existingParam.type : 'REAL32'
          })
          return updated
        })
        setUpdateCounter(prev => prev + 1)
      }
      
      return { success: true }
    } catch (error) {
      console.error(`❌ [ParametersContext] Error actualizando ${name}:`, error)
      notify.error(`Error al actualizar ${name}`)
      return { success: false, message: error.message }
    }
  }, [parameters, notify])

  /**
   * Actualizar múltiples parámetros
   * @param {Array<{name: string, value: number}>} params - Array de parámetros a actualizar
   * @returns {Promise<{success: number, failed: number, errors: Array}>}
   */
  const setMultipleParameters = useCallback(async (params) => {
    let success = 0
    let failed = 0
    const errors = []

    for (const { name, value } of params) {
      const result = await setParameter(name, value)
      if (result) {
        success++
      } else {
        failed++
        errors.push(name)
      }
    }

    return { success, failed, errors }
  }, [setParameter])

  /**
   * Solicitar descarga de parámetros del vehículo
   * @returns {Promise<{success: boolean, message: string}>} Resultado de la solicitud
   */
  const requestParameters = useCallback(async () => {
    try {
      const response = await fetch('/api/mavlink/parameters/request', { method: 'POST' })
      const result = await response.json()

      if (result.success) {
        // Forzar recarga después de un breve delay
        setTimeout(() => loadParameters(true), 1000)
        return { success: true, message: result.message }
      } else {
        // Devolver resultado del servidor tal como es
        return { success: false, message: result.message }
      }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }, [loadParameters])

  /**
   * Limpiar caché y forzar recarga
   */
  const clearCache = useCallback(() => {
    lastLoadTime.current = null
    setParameters(new Map())
    setStats({ total: 0, received: 0, complete: false })
  }, [])

  const value = useMemo(() => ({
    // Estado
    parameters,
    updateCounter, // Para forzar re-render en componentes
    loading,
    stats,
    isConnected,
    
    // Métodos de lectura
    getParameter,
    getParametersByPattern,
    getAllParameters,
    
    // Métodos de escritura
    setParameter,
    setMultipleParameters,
    
    // Métodos de gestión
    loadParameters,
    requestParameters,
    clearCache,
    
    // Alias para compatibilidad
    parameterStats: stats
  }), [
    parameters,
    updateCounter,
    loading,
    stats,
    isConnected,
    getParameter,
    getParametersByPattern,
    getAllParameters,
    setParameter,
    setMultipleParameters,
    loadParameters,
    requestParameters,
    clearCache
  ])

  return (
    <ParametersContext.Provider value={value}>
      {children}
    </ParametersContext.Provider>
  )
}
