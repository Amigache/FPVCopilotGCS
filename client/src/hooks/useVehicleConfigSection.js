import { useState, useCallback } from 'react'
import { useParameters } from '../contexts/ParametersContext'
import { useNotification } from '../contexts/NotificationContext'

/**
 * Hook compartido para secciones de configuración del vehículo
 * Maneja el estado común de loading, saving, modified y operaciones de guardado
 * 
 * @param {Object} options - Opciones de configuración
 * @param {Function} options.loadDataFn - Función async que carga y retorna los datos
 * @param {Function} options.getChangedParams - Función que retorna array de {name, value} a guardar
 * @param {Function} options.onSaveSuccess - Callback opcional después de guardar exitosamente
 * @param {Function} options.onLoadSuccess - Callback opcional después de cargar exitosamente
 * @param {Function} options.t - Función de traducción i18n (opcional)
 * @returns {Object} Estado y funciones para manejar la sección
 */
export function useVehicleConfigSection({
  loadDataFn,
  getChangedParams,
  onSaveSuccess,
  onLoadSuccess,
  t
} = {}) {
  const { setMultipleParameters, loadParameters } = useParameters()
  const notify = useNotification()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modified, setModified] = useState(false)
  const [originalValues, setOriginalValues] = useState({})
  const [isLoadingRef, setIsLoadingRef] = useState(false)

  /**
   * Carga los datos de la sección
   */
  const loadData = useCallback(async () => {
    // Evitar llamadas múltiples simultáneas
    if (isLoadingRef) {
      console.log('[useVehicleConfigSection] Ya hay una carga en progreso, saltando...')
      return
    }

    setIsLoadingRef(true)
    setLoading(true)

    try {
      // Cargar parámetros desde el contexto
      const paramsMap = await loadParameters()
      
      // Llamar a la función de carga específica de la sección
      if (loadDataFn) {
        const result = await loadDataFn(paramsMap)
        
        // Guardar valores originales para detectar cambios
        if (result?.originalValues) {
          setOriginalValues(result.originalValues)
        }
        
        // Callback de éxito
        if (onLoadSuccess) {
          onLoadSuccess(result)
        }
      }
    } catch (error) {
      console.error('[useVehicleConfigSection] Error cargando datos:', error)
      notify.error(t?.('common.errorLoading') || 'Error al cargar la configuración')
    } finally {
      setLoading(false)
      setIsLoadingRef(false)
    }
  }, [loadDataFn, loadParameters, onLoadSuccess, notify, isLoadingRef])

  /**
   * Guarda los cambios realizados
   */
  const saveChanges = useCallback(async () => {
    if (!modified) {
      notify.info(t?.('common.noChanges') || 'No hay cambios para guardar')
      return { success: false, reason: 'no-changes' }
    }

    setSaving(true)

    try {
      // Obtener parámetros a actualizar
      const paramsToUpdate = getChangedParams ? getChangedParams() : []

      if (paramsToUpdate.length === 0) {
        notify.info(t?.('common.noChanges') || 'No hay cambios para guardar')
        return { success: false, reason: 'no-changes' }
      }

      // Actualizar usando el contexto
      const result = await setMultipleParameters(paramsToUpdate)

      if (result.failed > 0) {
        // Algunos parámetros fueron rechazados
        notify.warning(
          t?.('common.parametersRejected', { count: result.failed }) || 
          `${result.failed} parámetro(s) rechazado(s) por el vehículo`
        )
        // Recargar para obtener los valores reales
        setTimeout(() => loadData(), 1000)
        return { success: false, reason: 'partial-failure', result }
      } else if (result.success > 0) {
        // Todos los parámetros fueron aceptados
        setModified(false)
        notify.success(t?.('common.savedSuccessfully') || 'Guardado exitosamente')
        
        if (onSaveSuccess) {
          onSaveSuccess(result)
        }
        
        return { success: true, result }
      } else {
        notify.error(t?.('common.errorSaving') || 'Error al guardar')
        return { success: false, reason: 'failure', result }
      }
    } catch (error) {
      console.error('[useVehicleConfigSection] Error guardando:', error)
      notify.error(t?.('common.errorSaving') || 'Error al guardar')
      return { success: false, reason: 'exception', error }
    } finally {
      setSaving(false)
    }
  }, [modified, getChangedParams, setMultipleParameters, notify, loadData, onSaveSuccess, t])

  /**
   * Resetea los cambios a los valores originales
   */
  const resetChanges = useCallback(() => {
    setModified(false)
    return originalValues
  }, [originalValues])

  /**
   * Marca la sección como modificada
   */
  const markAsModified = useCallback(() => {
    setModified(true)
  }, [])

  /**
   * Actualiza los valores originales (útil después de un guardado exitoso)
   */
  const updateOriginalValues = useCallback((newValues) => {
    setOriginalValues(newValues)
  }, [])

  return {
    // Estado
    loading,
    saving,
    modified,
    originalValues,
    
    // Funciones
    loadData,
    saveChanges,
    resetChanges,
    markAsModified,
    updateOriginalValues,
    
    // Para useImperativeHandle
    hasUnsavedChanges: () => modified
  }
}

export default useVehicleConfigSection
