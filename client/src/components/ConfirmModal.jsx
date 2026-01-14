import { useTranslation } from 'react-i18next'
import './Modal.css'

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, type = 'warning', confirmText, cancelText, isLoading = false }) {
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

  const handleConfirm = () => {
    onConfirm()
  }

  return (
    <div className="modal-overlay" onClick={isLoading ? undefined : onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-header ${type}`}>
          <div className="modal-icon">{getIcon()}</div>
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button 
            className="modal-button cancel" 
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText || t('modal.cancel')}
          </button>
          <button 
            className="modal-button confirm" 
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? '⏳' : (confirmText || t('modal.confirm'))}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
