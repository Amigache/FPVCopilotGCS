import { useTranslation } from 'react-i18next'
import './UnifiedModal.css'

/**
 * Modal unificado y flexible que reemplaza Modal.jsx, ConfirmModal.jsx
 * Soporta:
 * - Contenido simple (mensaje de texto)
 * - Contenido customizado (children)
 * - 1 o múltiples botones configurables
 * - Estados de carga por botón
 * - Tipos visuales (info, success, error, warning, danger)
 */
function UnifiedModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  children,
  type = 'info',
  buttons = [],
  closeOnBackdrop = true
}) {
  const { t } = useTranslation()
  
  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'error':
        return '⚠️'
      case 'success':
        return '✅'
      case 'warning':
        return '⚡'
      case 'danger':
        return '🚨'
      default:
        return 'ℹ️'
    }
  }

  const handleBackdropClick = () => {
    if (closeOnBackdrop && onClose) {
      onClose()
    }
  }

  // Si no hay botones definidos, usar botón por defecto "Entendido"
  const finalButtons = buttons.length > 0 ? buttons : [
    {
      label: t('modal.understood'),
      onClick: onClose,
      variant: 'primary'
    }
  ]

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-header ${type}`}>
          <div className="modal-icon">{getIcon()}</div>
          <h3 className="modal-title">{title}</h3>
        </div>
        
        <div className="modal-body">
          {children ? (
            children
          ) : (
            <p className="modal-message">{message}</p>
          )}
        </div>
        
        <div className="modal-footer">
          {finalButtons.map((button, index) => (
            <button
              key={index}
              className={`modal-button ${button.variant || 'primary'}`}
              onClick={button.onClick}
              disabled={button.disabled || button.loading}
            >
              {button.loading ? '⏳' : button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default UnifiedModal
