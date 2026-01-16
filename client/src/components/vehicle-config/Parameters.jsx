import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './common.css'
import './Parameters.css'
import OnScreenKeyboard from '../OnScreenKeyboard'
import { useNotification } from '../../contexts/NotificationContext'
import { useParameters } from '../../contexts/ParametersContext'

function Parameters() {
  const { t } = useTranslation()
  const notify = useNotification()
  const { getAllParameters, setParameter, requestParameters: ctxRequestParameters, parameterStats, isConnected, loadParameters: ctxLoadParameters } = useParameters()
  const [filteredParams, setFilteredParams] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [editingParam, setEditingParam] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [keyboard, setKeyboard] = useState({ isOpen: false, fieldName: '', fieldType: 'search', initialValue: '', keyboardType: 'text' })
  const autoDownloadAttempted = useRef(false)

  useEffect(() => {
    // Reiniciar el ref cuando el componente se monta
    autoDownloadAttempted.current = false
    loadParameters()
  }, [])

  useEffect(() => {
    filterParameters()
  }, [searchTerm])

  useEffect(() => {
    // Auto-descargar parámetros solo una vez si no hay suficientes
    if (isConnected && parameterStats.total === 0 && !downloading && !autoDownloadAttempted.current) {
      autoDownloadAttempted.current = true
      requestParameters(true) // true = es descarga automática
    }
  }, [isConnected, parameterStats.total, downloading])

  const loadParameters = async () => {
    setLoading(true)
    await ctxLoadParameters()
    setLoading(false)
  }

  const requestParameters = async (isAutomatic = false) => {
    setDownloading(true)
    try {
      const result = await ctxRequestParameters()
      
      if (result.success) {
        // Polling para actualizar el progreso en tiempo real
        let lastReceived = 0
        const pollInterval = setInterval(async () => {
          // Verificar si la descarga está completa
          if (parameterStats.complete && parameterStats.total > 0) {
            clearInterval(pollInterval)
            setDownloading(false)
            // Cargar los parámetros descargados
            await loadParameters()
            if (!isAutomatic) {
              notify.success(t('parameters.modals.downloadSuccess', { count: parameterStats.total }))
            }
            return
          }
          
          // Detectar si hubo progreso en los últimos 2 segundos
          // Si no, probablemente se completó pero no lo sabemos aún
          if (parameterStats.received > 0 && parameterStats.total > 0) {
            if (parameterStats.received === lastReceived && parameterStats.received === parameterStats.total) {
              // No hubo cambio y todos fueron recibidos
              clearInterval(pollInterval)
              setDownloading(false)
              // Cargar los parámetros descargados
              await loadParameters()
              if (!isAutomatic) {
                notify.success(t('parameters.modals.downloadSuccess', { count: parameterStats.total }))
              }
              return
            }
            lastReceived = parameterStats.received
          }
        }, 500) // Actualizar cada 500ms
        
        // Timeout de seguridad (30 segundos)
        setTimeout(() => {
          clearInterval(pollInterval)
          setDownloading(false)
        }, 30000)
      } else {
        // Solo mostrar error si es descarga manual
        if (!isAutomatic) {
          notify.warning(result.message || t('parameters.modals.noConnectionMessage'))
        }
        setDownloading(false)
      }
    } catch (error) {
      console.error('Error solicitando parámetros:', error)
      if (!isAutomatic) {
        notify.error(t('parameters.modals.serverConnectionError'))
      }
      setDownloading(false)
    }
  }

  const filterParameters = () => {
    const allParams = getAllParameters()
    if (!searchTerm) {
      setFilteredParams(allParams)
      return
    }
    
    const filtered = allParams.filter(param =>
      param.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredParams(filtered)
  }

  const startEdit = (param) => {
    setEditingParam(param.name)
    setEditValue(param.value.toString())
  }

  const cancelEdit = () => {
    setEditingParam(null)
    setEditValue('')
  }

  const saveParameter = async (paramName) => {
    try {
      const result = await setParameter(paramName, editValue)
      
      if (result.success) {
        notify.success(t('parameters.modals.parameterUpdateSuccess', { name: paramName }))
        cancelEdit()
      } else {
        notify.error(result.message || t('parameters.modals.parameterUpdateError'))
      }
    } catch (error) {
      console.error('Error guardando parámetro:', error)
      notify.error(t('parameters.modals.saveConnectionError'))
    }
  }

  return (
    <div className="config-section">
      
      <div className="section-header">
        <div className="header-left">
          <h3 className="section-title">{t('parameters.title')}</h3>
          <p className="section-description">
            {t('parameters.description')}
          </p>
        </div>
        <div className="header-right">
          <button 
            className="download-button" 
            onClick={() => requestParameters(false)}
            disabled={downloading || loading}
          >
            {downloading ? t('parameters.downloading') : t('parameters.downloadButton')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('parameters.loading')}</p>
        </div>
      ) : (
        <>
          {isConnected && parameterStats.total > 0 && (
            <div className="param-stats">
              <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.total')}:</span>
            <span className="stat-value">{parameterStats.total}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.received')}:</span>
            <span className="stat-value">{parameterStats.received}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.progress')}:</span>
            <span className="stat-value">
              {parameterStats.total > 0 ? Math.round((parameterStats.received / parameterStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.status')}:</span>
            <span className={`stat-badge ${parameterStats.complete ? 'complete' : 'incomplete'}`}>
              {parameterStats.complete ? t('parameters.stats.complete') : t('parameters.stats.downloading')}
            </span>
          </div>
        </div>
      )}

      <div className="settings-card">
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder={t('parameters.searchPlaceholder')}
            value={searchTerm}
            readOnly
            onClick={() => setKeyboard({ isOpen: true, fieldName: t('parameters.searchPlaceholder'), fieldType: 'search', initialValue: searchTerm, keyboardType: 'text' })}
          />
          {searchTerm && (
            <button 
              className="clear-search"
              onClick={() => setSearchTerm('')}
            >
              ✕
            </button>
          )}
        </div>

        {filteredParams.length === 0 ? (
          <div className="empty-state">
            {getAllParameters().length === 0 ? (
              <>
                <div className="empty-icon">📋</div>
                <p>{t('parameters.noParameters')}</p>
                <p className="empty-hint">{t('parameters.clickToDownload')}</p>
              </>
            ) : (
              <>
                <div className="empty-icon">🔍</div>
                <p>{t('parameters.noResults')}</p>
                <p className="empty-hint">{t('parameters.tryDifferentSearch')}</p>
              </>
            )}
          </div>
        ) : (
          <div className="parameters-table">
            <div className="table-header">
              <div className="header-cell name">{t('parameters.table.parameter')}</div>
              <div className="header-cell type">{t('parameters.table.type')}</div>
              <div className="header-cell value">{t('parameters.table.value')}</div>
              <div className="header-cell actions">{t('parameters.table.actions')}</div>
            </div>
            <div className="table-body">
              {filteredParams.map((param) => (
                <div key={param.name} className="table-row">
                  <div className="cell name">{param.name}</div>
                  <div className="cell type">
                    <span className="type-badge">{param.type}</span>
                  </div>
                  <div className="cell value">
                    {editingParam === param.name ? (
                      <input
                        type="number"
                        step="any"
                        className="edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span className="value-text">{param.value}</span>
                    )}
                  </div>
                  <div className="cell actions">
                    {editingParam === param.name ? (
                      <>
                        <button 
                          className="action-btn save"
                          onClick={() => saveParameter(param.name)}
                          title={t('parameters.actions.save')}
                        >
                          ✓
                        </button>
                        <button 
                          className="action-btn cancel"
                          onClick={cancelEdit}
                          title={t('parameters.actions.cancel')}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button 
                        className="action-btn edit"
                        onClick={() => startEdit(param)}
                        title={t('parameters.actions.edit')}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        <OnScreenKeyboard
            isOpen={keyboard.isOpen}
            onClose={() => setKeyboard({ ...keyboard, isOpen: false })}
            onSubmit={(value) => {
              if (keyboard.fieldType === 'search') {
                setSearchTerm(value)
              } else if (keyboard.fieldType === 'edit') {
                setEditValue(value)
              }
            }}
            fieldName={keyboard.fieldName}
            initialValue={keyboard.initialValue}
            keyboardType={keyboard.keyboardType}
          />
        </>
      )}
    </div>
  )
}

export default Parameters
