import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { useNotification } from '../contexts/NotificationContext'
import './ParameterDownloadModal.css'

function ParameterDownloadModal({ isOpen, onClose }) {
  const { t } = useTranslation()
  const notify = useNotification()
  const { parametersProgress } = useWebSocketContext()
  const [isCancelling, setIsCancelling] = useState(false)
  const wasOpenRef = useRef(false)
  const notifiedRef = useRef(false)
  const closedManuallyRef = useRef(false)

  // Rastrear si el modal estuvo abierto
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true
      notifiedRef.current = false
      closedManuallyRef.current = false
    }
  }, [isOpen])

  // Cerrar automáticamente cuando se complete (si está abierto)
  useEffect(() => {
    if (!isOpen) return

    if (parametersProgress.complete && parametersProgress.received > 0 && !isCancelling) {
      console.log('✅ Descarga de parámetros completada, cerrando modal en 1s...')
      const timer = setTimeout(() => {
        // No es cierre manual, es automático
        closedManuallyRef.current = false
        onClose()
      }, 1000) // Esperar 1s para que el usuario vea el 100%
      
      return () => clearTimeout(timer)
    }
  }, [isOpen, parametersProgress.complete, parametersProgress.received, onClose, isCancelling])

  // Notificar cuando se complete en background (modal cerrado manualmente)
  useEffect(() => {
    if (!isOpen && wasOpenRef.current && closedManuallyRef.current && parametersProgress.complete && parametersProgress.received > 0 && !notifiedRef.current) {
      notify.success(t('parameterDownload.completeBackground', { count: parametersProgress.received }))
      notifiedRef.current = true
      wasOpenRef.current = false
    }
  }, [isOpen, parametersProgress.complete, parametersProgress.received, notify, t])

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      // Solo cancelar la descarga, NO desconectar
      await fetch('/api/mavlink/parameters/cancel', { method: 'POST' })
      console.log('🛑 Descarga de parámetros cancelada (conexión activa)')
      notify.info(t('parameterDownload.cancelled'))
      onClose()
    } catch (error) {
      console.error('Error cancelando descarga:', error)
      notify.error(t('parameterDownload.cancelError'))
    } finally {
      setIsCancelling(false)
    }
  }

  const handleCloseBackground = () => {
    // Cerrar el modal manualmente - marcar para notificar cuando complete
    closedManuallyRef.current = true
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
