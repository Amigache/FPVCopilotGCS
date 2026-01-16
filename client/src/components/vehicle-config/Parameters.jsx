import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './common.css'
import './Parameters.css'
import Modal from '../Modal'
import OnScreenKeyboard from '../OnScreenKeyboard'

function Parameters() {
  const { t } = useTranslation()
  const [parameters, setParameters] = useState([])
  const [filteredParams, setFilteredParams] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [paramStats, setParamStats] = useState({ total: 0, received: 0, complete: false })
  const [isConnected, setIsConnected] = useState(false)
  const [editingParam, setEditingParam] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' })
  const [keyboard, setKeyboard] = useState({ isOpen: false, fieldName: '', fieldType: 'search', initialValue: '', keyboardType: 'text' })

  useEffect(() => {
    loadParameters()
  }, [])

  useEffect(() => {
    filterParameters()
  }, [searchTerm, parameters])

  const loadParameters = async () => {
    try {
      // Primero verificar si hay conexión activa
      const statusResponse = await fetch('/api/mavlink/parameters/status')
      const statusData = await statusResponse.json()
      setIsConnected(statusData.connected || false)
      
      // Si no hay conexión activa, limpiar datos
      if (!statusData.connected) {
        setParameters([])
        setParamStats({ total: 0, received: 0, complete: false })
        return
      }
      
      // Si hay conexión, cargar parámetros
      const response = await fetch('/api/mavlink/parameters')
      const data = await response.json()
      setParameters(data.parameters || [])
      setParamStats({
        total: data.total,
        received: data.received,
        complete: data.complete
      })
    } catch (error) {
      console.error('Error cargando parámetros:', error)
      setIsConnected(false)
      setParameters([])
      setParamStats({ total: 0, received: 0, complete: false })
    }
  }

  const requestParameters = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/mavlink/parameters/request', {
        method: 'POST'
      })
      const result = await response.json()
      
      if (result.success) {
        // Polling para actualizar el progreso en tiempo real
        const pollInterval = setInterval(async () => {
          const progressResponse = await fetch('/api/mavlink/parameters')
          const progressData = await progressResponse.json()
          
          setParameters(progressData.parameters || [])
          setParamStats({
            total: progressData.total,
            received: progressData.received,
            complete: progressData.complete
          })
          
          // Si está completo, detener el polling
          if (progressData.complete && progressData.total > 0) {
            clearInterval(pollInterval)
            setLoading(false)
            setModal({
              isOpen: true,
              title: t('parameters.modals.downloadComplete'),
              message: t('parameters.modals.downloadSuccess', { count: progressData.total }),
              type: 'success'
            })
          }
        }, 200) // Actualizar cada 200ms para ver el progreso
        
        // Timeout de seguridad (30 segundos)
        setTimeout(() => {
          clearInterval(pollInterval)
          setLoading(false)
        }, 30000)
      } else {
        setModal({
          isOpen: true,
          title: t('parameters.modals.noConnection'),
          message: result.message || t('parameters.modals.noConnectionMessage'),
          type: 'warning'
        })
        setLoading(false)
      }
    } catch (error) {
      console.error('Error solicitando parámetros:', error)
      setModal({
        isOpen: true,
        title: t('parameters.modals.connectionError'),
        message: t('parameters.modals.serverConnectionError'),
        type: 'error'
      })
      setLoading(false)
    }
  }

  const filterParameters = () => {
    if (!searchTerm) {
      setFilteredParams(parameters)
      return
    }
    
    const filtered = parameters.filter(param =>
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
      const response = await fetch('/api/mavlink/parameters/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: paramName, value: editValue })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setModal({
          isOpen: true,
          title: t('parameters.modals.parameterUpdated'),
          message: t('parameters.modals.parameterUpdateSuccess', { name: paramName }),
          type: 'success'
        })
        loadParameters()
        cancelEdit()
      } else {
        setModal({
          isOpen: true,
          title: t('parameters.modals.saveError'),
          message: result.message || t('parameters.modals.parameterUpdateError'),
          type: 'error'
        })
      }
    } catch (error) {
      console.error('Error guardando parámetro:', error)
      setModal({
        isOpen: true,
        title: t('parameters.modals.connectionError'),
        message: t('parameters.modals.saveConnectionError'),
        type: 'error'
      })
    }
  }

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' })
  }

  return (
    <div className="config-section">
      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
      
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
            onClick={requestParameters}
            disabled={loading}
          >
            {loading ? t('parameters.downloading') : t('parameters.downloadButton')}
          </button>
        </div>
      </div>

      {isConnected && paramStats.total > 0 && (
        <div className="param-stats">
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.total')}:</span>
            <span className="stat-value">{paramStats.total}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.received')}:</span>
            <span className="stat-value">{paramStats.received}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.progress')}:</span>
            <span className="stat-value">
              {paramStats.total > 0 ? Math.round((paramStats.received / paramStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('parameters.stats.status')}:</span>
            <span className={`stat-badge ${paramStats.complete ? 'complete' : 'incomplete'}`}>
              {paramStats.complete ? t('parameters.stats.complete') : t('parameters.stats.downloading')}
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
            {parameters.length === 0 ? (
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
    </div>
  )
}

export default Parameters
