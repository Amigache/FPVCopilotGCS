import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useNotification } from './NotificationContext'

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
  
  // Estado de parámetros
  const [parameters, setParameters] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total: 0, received: 0, complete: false })
  const [isConnected, setIsConnected] = useState(false)
  
  // Control de caché
  const lastLoadTime = useRef(null)
  const loadingRef = useRef(false)
  const CACHE_DURATION = 30000 // 30 segundos

  /**
   * Cargar parámetros desde el servidor
   * @param {boolean} force - Forzar recarga ignorando caché
   */
  const loadParameters = useCallback(async (force = false) => {
    // Evitar llamadas simultáneas
    if (loadingRef.current && !force) {
      console.log('⏸️  [ParametersContext] Carga ya en progreso, saltando...')
      return parameters
    }

    // Verificar caché (solo si no es forzado)
    if (!force && lastLoadTime.current) {
      const timeSinceLastLoad = Date.now() - lastLoadTime.current
      if (timeSinceLastLoad < CACHE_DURATION) {
        console.log(`✅ [ParametersContext] Usando caché (${Math.round(timeSinceLastLoad / 1000)}s desde última carga)`)
        return parameters
      }
    }

    loadingRef.current = true
    setLoading(true)

    try {
      // Verificar conexión
      const statusResponse = await fetch('/api/mavlink/parameters/status')
      const statusData = await statusResponse.json()
      setIsConnected(statusData.connected || false)

      if (!statusData.connected) {
        console.log('⚠️  [ParametersContext] No hay conexión activa')
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
      console.log(`✅ [ParametersContext] ${paramsMap.size} parámetros cargados`)

      return paramsMap
    } catch (error) {
      console.error('❌ [ParametersContext] Error cargando parámetros:', error)
      notify.error('Error al cargar parámetros del vehículo')
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
      console.log(`🔄 [ParametersContext] Actualizando ${name} = ${value}`)

      // Actualización optimista (actualizar UI inmediatamente)
      const previousValue = parameters.get(name)
      setParameters(prev => {
        const updated = new Map(prev)
        const existingParam = prev.get(name)
        updated.set(name, {
          value: parseFloat(value),
          type: existingParam ? existingParam.type : 'REAL32'
        })
        return updated
      })

      // Enviar al servidor
      const response = await fetch('/api/mavlink/parameters/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value: parseFloat(value) })
      })

      const result = await response.json()

      if (!result.success) {
        // Revertir si falló
        console.error(`❌ [ParametersContext] Error actualizando ${name}:`, result.message)
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

      console.log(`✅ [ParametersContext] ${name} actualizado correctamente`)
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
    console.log(`🔄 [ParametersContext] Actualizando ${params.length} parámetros...`)
    
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

    console.log(`✅ [ParametersContext] Actualizados: ${success}, Fallidos: ${failed}`)
    
    return { success, failed, errors }
  }, [setParameter])

  /**
   * Solicitar descarga de parámetros del vehículo
   * @returns {Promise<boolean>} true si se inició la solicitud correctamente
   */
  const requestParameters = useCallback(async () => {
    try {
      console.log('📥 [ParametersContext] Solicitando descarga de parámetros...')
      
      const response = await fetch('/api/mavlink/parameters/request', { method: 'POST' })
      const result = await response.json()

      if (result.success) {
        console.log('✅ [ParametersContext] Solicitud de parámetros enviada')
        // Forzar recarga después de un breve delay
        setTimeout(() => loadParameters(true), 1000)
        return true
      } else {
        console.error('❌ [ParametersContext] Error en solicitud:', result.message)
        notify.warning('No se pudieron solicitar los parámetros')
        return false
      }
    } catch (error) {
      console.error('❌ [ParametersContext] Error solicitando parámetros:', error)
      notify.error('Error al solicitar parámetros')
      return false
    }
  }, [loadParameters, notify])

  /**
   * Limpiar caché y forzar recarga
   */
  const clearCache = useCallback(() => {
    console.log('🗑️  [ParametersContext] Limpiando caché...')
    lastLoadTime.current = null
    setParameters(new Map())
    setStats({ total: 0, received: 0, complete: false })
  }, [])

  const value = {
    // Estado
    parameters,
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
  }

  return (
    <ParametersContext.Provider value={value}>
      {children}
    </ParametersContext.Provider>
  )
}
