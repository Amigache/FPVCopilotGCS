import { useNotification } from '../contexts/NotificationContext'
import './ToastContainer.css'

/**
 * Contenedor de notificaciones tipo "toast" que se muestran en la esquina
 * de la pantalla sin bloquear la UI.
 * 
 * Se integra una sola vez en App.jsx
 */
function ToastContainer() {
  const { notifications, remove } = useNotification()

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return 'ℹ️'
    }
  }

  return (
    <div className="toast-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`toast toast-${notification.type}`}
          onClick={() => remove(notification.id)}
        >
          <div className="toast-icon">
            {getIcon(notification.type)}
          </div>
          <div className="toast-content">
            <p className="toast-message">{notification.message}</p>
          </div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation()
              remove(notification.id)
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
