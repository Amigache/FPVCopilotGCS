import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import './ParameterDownloadModal.css'

function ParameterDownloadModal({ isOpen, onClose }) {
  const { t } = useTranslation()
  const { parametersProgress } = useWebSocketContext()
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    // Cerrar automáticamente cuando se complete
    if (parametersProgress.complete && parametersProgress.received > 0 && !isCancelling) {
      setTimeout(() => {
        onClose()
      }, 1500) // Esperar 1.5s para que el usuario vea el 100%
    }
  }, [isOpen, parametersProgress.complete, parametersProgress.received, onClose, isCancelling])

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      // Desconectar para detener la descarga
      await fetch('/api/mavlink/disconnect', { method: 'POST' })
      onClose()
    } catch (error) {
      console.error('Error cancelando descarga:', error)
    }
  }

  const handleCloseBackground = () => {
    // Cerrar el modal pero dejar que la descarga continúe
    onClose()
  }

  if (!isOpen) return null

  const percentage = parametersProgress.count > 0 
    ? Math.round((parametersProgress.received / parametersProgress.count) * 100) 
    : 0

  return (
    <div className="param-download-modal-overlay">
      <div className="param-download-modal">
        <div className="param-download-header">
          <h3>{t('parameterDownload.title')}</h3>
        </div>
        <div className="param-download-body">
          <div className="param-download-info">
            <span className="param-download-count">
              {parametersProgress.received} / {parametersProgress.count} {t('parameterDownload.parameters')}
            </span>
            <span className="param-download-percentage">
              {percentage}%
            </span>
          </div>
          <div className="param-download-progress-bar">
            <div 
              className="param-download-progress-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
          {parametersProgress.complete ? (
            <div className="param-download-complete">
              {t('parameterDownload.complete')}
            </div>
          ) : (
            <div className="param-download-actions">
              <button 
                className="param-btn-secondary"
                onClick={handleCloseBackground}
                disabled={isCancelling}
              >
                {t('parameterDownload.continueBackground')}
              </button>
              <button 
                className="param-btn-danger"
                onClick={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? t('parameterDownload.cancelling') : t('parameterDownload.cancel')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ParameterDownloadModal
