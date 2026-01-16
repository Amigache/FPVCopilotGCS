import { createContext, useContext, useState, useCallback } from 'react'

const NotificationContext = createContext(null)

/**
 * Hook para usar el sistema de notificaciones desde cualquier componente
 * 
 * @example
 * const notify = useNotification()
 * notify.success('¡Guardado correctamente!')
 * notify.error('Error al conectar')
 * notify.warning('Batería baja')
 * notify.info('Descargando parámetros...')
 */
export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification debe usarse dentro de NotificationProvider')
  }
  return context
}

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([])

  const showNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    
    const notification = {
      id,
      message,
      type,
      timestamp: Date.now()
    }

    setNotifications(prev => [...prev, notification])

    // Auto-dismiss después del duration
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }

    return id
  }, [])

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const value = {
    notifications,
    success: (message, duration) => showNotification(message, 'success', duration),
    error: (message, duration) => showNotification(message, 'error', duration),
    warning: (message, duration) => showNotification(message, 'warning', duration),
    info: (message, duration) => showNotification(message, 'info', duration),
    remove: removeNotification,
    clear: () => setNotifications([])
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
