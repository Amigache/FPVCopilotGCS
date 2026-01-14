import { useTranslation } from 'react-i18next'
import './Modal.css'

function Modal({ isOpen, onClose, title, message, type = 'info' }) {
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
      default:
        return 'ℹ️'
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-header ${type}`}>
          <div className="modal-icon">{getIcon()}</div>
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button className="modal-button" onClick={onClose}>
            {t('modal.understood')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Modal
