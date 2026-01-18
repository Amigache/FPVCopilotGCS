import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './Connections.css'
import ParameterDownloadModal from '../ParameterDownloadModal'
import OnScreenKeyboard from '../OnScreenKeyboard'
import { useNotification } from '../../contexts/NotificationContext'
import { useWebSocketContext } from '../../contexts/WebSocketContext'

function Connections() {
  const { t } = useTranslation()
  const notify = useNotification()
  const { connectionStatus, markManualDisconnect, enableAutoReconnect } = useWebSocketContext()
  const [connecting, setConnecting] = useState(false)
  const [showParamDownload, setShowParamDownload] = useState(false)
  const [connections, setConnections] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeConnection, setActiveConnection] = useState(null) // ID de la conexión activa
  const [keyboard, setKeyboard] = useState({ isOpen: false, fieldName: '', fieldKey: '', initialValue: '', keyboardType: 'text' })
  const [newConnection, setNewConnection] = useState({
    name: '',
    type: 'serial',
    config: {
      port: '/dev/ttyUSB0',
      baudrate: '115200'
    }
  })

  // Cargar conexiones guardadas al iniciar
  useEffect(() => {
    const savedConnections = localStorage.getItem('mavlink_connections')
    if (savedConnections) {
      const parsedConnections = JSON.parse(savedConnections)
      setConnections(parsedConnections)
      
      // Verificar si hay una conexión activa guardada (solo para mostrar el estado)
      const savedActiveConnection = localStorage.getItem('mavlink_active_connection')
      if (savedActiveConnection) {
        const activeId = JSON.parse(savedActiveConnection)
        setActiveConnection(activeId)
      }
    }
  }, [])
  
  // Sincronizar activeConnection con el estado real de conexión desde WebSocket
  useEffect(() => {
    const savedActiveConnection = localStorage.getItem('mavlink_active_connection')
    
    // Si hay conexión activa en el servidor, restaurar desde localStorage
    if (connectionStatus?.connected && savedActiveConnection && !activeConnection) {
      setActiveConnection(JSON.parse(savedActiveConnection))
    }
    
    // Si el servidor NO está conectado y tenemos activeConnection, solo limpiar después de un delay
    // para evitar limpiar durante reconexiones temporales
    if (!connectionStatus?.connected && activeConnection !== null) {
      const timer = setTimeout(() => {
        // Verificar nuevamente después del delay
        if (!connectionStatus?.connected) {
          setActiveConnection(null)
          localStorage.removeItem('mavlink_active_connection')
        }
      }, 5000) // Dar 5 segundos para reconectar antes de limpiar
      
      return () => clearTimeout(timer)
    }
  }, [connectionStatus?.connected, activeConnection])

  // Guardar conexiones cuando cambien
  useEffect(() => {
    if (connections.length > 0) {
      localStorage.setItem('mavlink_connections', JSON.stringify(connections))
    }
  }, [connections])
  
  // Guardar activeConnection cuando cambie
  useEffect(() => {
    if (activeConnection !== null) {
      localStorage.setItem('mavlink_active_connection', JSON.stringify(activeConnection))
    } else {
      localStorage.removeItem('mavlink_active_connection')
    }
  }, [activeConnection])

  const handleDisconnect = async () => {
    try {
      // Marcar como desconexión manual para detener auto-reconnect
      markManualDisconnect()
      
      const response = await fetch('/api/mavlink/disconnect', { method: 'POST' })
      const result = await response.json()
      
      if (result.success) {
        // Limpiar estado inmediatamente
        setActiveConnection(null)
        localStorage.removeItem('mavlink_active_connection')
        
        // No mostrar modal, la desconexión es silenciosa
        console.log('Desconectado exitosamente')
      }
    } catch (error) {
      console.error('Error desconectando:', error)
      notify.error(t('connections.messages.disconnectError'))
    }
  }

  const handleConnect = async (connection, isAutoConnect = false) => {
    setConnecting(true)
    
    // Reactivar auto-reconnect al conectar manualmente
    if (!isAutoConnect) {
      enableAutoReconnect()
    }
    
    try {
      // Primero conectar
      const response = await fetch('/api/mavlink/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: connection.type, config: connection.config })
      })
      const result = await response.json()
      
      if (result.success) {
        // Establecer como conexión activa
        setActiveConnection(connection.id)
        localStorage.setItem('mavlink_active_connection', JSON.stringify(connection.id))
        
        if (!isAutoConnect) {
          console.log('Conexión establecida:', connection.name)
        }
        
        // Verificar si es modo servidor TCP
        const isTcpServer = connection.type === 'tcp' && connection.config.mode === 'Servidor'
        
        if (isTcpServer) {
          // Modo servidor: No solicitar parámetros aún, esperar a que un cliente se conecte
          if (!isAutoConnect) {
            notify.info(t('connections.messages.serverListening', { port: connection.config.port }))
          }
        } else {
          // Modo cliente o serial: Solicitar parámetros inmediatamente
          try {
            const paramResponse = await fetch('/api/mavlink/parameters/request', { method: 'POST' })
            const paramResult = await paramResponse.json()
            
            if (paramResult.success) {
              // Solo mostrar el modal si la solicitud de parámetros fue exitosa y no es auto-connect
              if (!isAutoConnect) {
                setShowParamDownload(true)
              }
            } else {
              // Conexión OK pero no se pudieron solicitar parámetros
              if (!isAutoConnect) {
                notify.warning(t('connections.messages.paramsRequestError', { message: paramResult.message }))
              }
            }
          } catch (error) {
            console.error('Error iniciando descarga de parámetros:', error)
            if (!isAutoConnect) {
              notify.error(t('connections.messages.paramsError'))
            }
          }
        }
      } else {
        setActiveConnection(null)
        localStorage.removeItem('mavlink_active_connection')
        
        if (!isAutoConnect) {
          notify.error(result.message || t('connections.messages.connectionFailed'))
        }
      }
    } catch (error) {
      console.error('Error conectando:', error)
      setActiveConnection(null)
      localStorage.removeItem('mavlink_active_connection')
      
      if (!isAutoConnect) {
        notify.error(t('connections.messages.serverNotAvailable'))
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleAddConnection = () => {
    if (!newConnection.name.trim()) {
      notify.error(t('connections.messages.nameRequired'))
      return
    }

    const connection = {
      id: Date.now(),
      ...newConnection
    }

    const updatedConnections = [...connections, connection]
    setConnections(updatedConnections)
    
    // Guardar inmediatamente en localStorage
    localStorage.setItem('mavlink_connections', JSON.stringify(updatedConnections))
    
    setShowAddModal(false)
    
    // Auto-conectar inmediatamente después de crear
    setTimeout(() => {
      handleConnect(connection)
    }, 100)
    
    // Resetear formulario con valores por defecto
    setNewConnection({ 
      name: '', 
      type: 'serial', 
      config: {
        port: '/dev/ttyUSB0',
        baudrate: '115200'
      }
    })
  }

  const handleDeleteConnection = (id) => {
    // Si es la conexión activa, desconectar primero
    if (activeConnection === id) {
      handleDisconnect()
    }
    
    const updatedConnections = connections.filter(conn => conn.id !== id)
    setConnections(updatedConnections)
    
    // Actualizar localStorage inmediatamente
    localStorage.setItem('mavlink_connections', JSON.stringify(updatedConnections))
  }

  // Función para abrir el teclado en pantalla
  const openKeyboard = (fieldName, fieldKey, initialValue = '', keyboardType = 'text') => {
    setKeyboard({ isOpen: true, fieldName, fieldKey, initialValue, keyboardType })
  }

  // Función para cerrar el teclado
  const closeKeyboard = () => {
    setKeyboard({ isOpen: false, fieldName: '', fieldKey: '', initialValue: '', keyboardType: 'text' })
  }

  // Función para manejar el envío del teclado
  const handleKeyboardSubmit = (value) => {
    const { fieldKey } = keyboard
    
    // Determinar si es un campo de configuración o el nombre
    if (fieldKey === 'name') {
      setNewConnection({ ...newConnection, name: value })
    } else {
      // Es un campo de config
      setNewConnection({
        ...newConnection,
        config: { ...newConnection.config, [fieldKey]: value }
      })
    }
  }

  const renderConnectionForm = () => {
    switch (newConnection.type) {
      case 'serial':
        return (
          <>
            <div className="form-group">
              <label className="form-label">{t('connections.form.serialPort')}</label>
              <div className="serial-port-selector">
                <select 
                  className="form-input"
                  value={newConnection.config.port || '/dev/ttyUSB0'}
                  onChange={(e) => setNewConnection({
                    ...newConnection,
                    config: { ...newConnection.config, port: e.target.value }
                  })}
                >
                  <option>/dev/ttyUSB0</option>
                  <option>/dev/ttyUSB1</option>
                  <option>/dev/ttyAMA0</option>
                </select>
                <button 
                  type="button"
                  className="btn-select-port"
                  onClick={handleSelectSerialPort}
                  title={t('connections.form.selectSerialPort')}
                >
                  🔍
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('connections.form.baudrate')}</label>
              <select 
                className="form-input"
                value={newConnection.config.baudrate || '115200'}
                onChange={(e) => setNewConnection({
                  ...newConnection,
                  config: { ...newConnection.config, baudrate: e.target.value }
                })}
              >
                <option>9600</option>
                <option>57600</option>
                <option>115200</option>
                <option>921600</option>
              </select>
            </div>
          </>
        )
      
      case 'tcp':
        return (
          <>
            <div className="form-group">
              <label className="form-label">{t('connections.form.mode')}</label>
              <select 
                className="form-input"
                value={newConnection.config.mode || 'Cliente'}
                onChange={(e) => setNewConnection({
                  ...newConnection,
                  config: { ...newConnection.config, mode: e.target.value }
                })}
              >
                <option>{t('connections.form.client')}</option>
                <option>{t('connections.form.server')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('connections.form.ipAddress')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="127.0.0.1"
                value={newConnection.config.ip || ''}
                readOnly
                onClick={() => openKeyboard(t('connections.form.ipAddress'), 'ip', newConnection.config.ip || '', 'text')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('connections.form.port')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="5760"
                value={newConnection.config.port || ''}
                readOnly
                onClick={() => openKeyboard(t('connections.form.port'), 'port', newConnection.config.port || '', 'number')}
              />
            </div>
          </>
        )
      
      case 'udp':
        return (
          <>
            <div className="form-group">
              <label className="form-label">{t('connections.form.localIp')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="0.0.0.0"
                value={newConnection.config.localIp || ''}
                readOnly
                onClick={() => openKeyboard(t('connections.form.localIp'), 'localIp', newConnection.config.localIp || '', 'text')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('connections.form.localPort')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="14550"
                value={newConnection.config.localPort || ''}
                readOnly
                onClick={() => openKeyboard(t('connections.form.localPort'), 'localPort', newConnection.config.localPort || '', 'number')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('connections.form.remoteIp')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="192.168.1.100"
                value={newConnection.config.remoteIp || ''}
                readOnly
                onClick={() => openKeyboard(t('connections.form.remoteIp'), 'remoteIp', newConnection.config.remoteIp || '', 'text')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('connections.form.remotePort')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="14555"
                value={newConnection.config.remotePort || ''}
                readOnly
                onClick={() => openKeyboard(t('connections.form.remotePort'), 'remotePort', newConnection.config.remotePort || '', 'number')}
              />
            </div>
          </>
        )
      
      default:
        return null
    }
  }

  const getConnectionTypeIcon = (type) => {
    switch(type) {
      case 'serial': return '🔌'
      case 'tcp': return '🌐'
      case 'udp': return '📡'
      default: return '⚙️'
    }
  }

  const handleSelectSerialPort = async () => {
    try {
      // Verificar si el navegador soporta Web Serial API
      if (!('serial' in navigator)) {
        notify.error(t('connections.messages.webSerialNotSupported'))
        return
      }

      // Solicitar al usuario que seleccione un puerto serial
      const port = await navigator.serial.requestPort()
      
      // Obtener información del puerto
      const info = port.getInfo()
      
      // Crear un nombre descriptivo para el puerto
      let portName = 'Web Serial'
      if (info.usbVendorId && info.usbProductId) {
        portName = `USB (VID: ${info.usbVendorId.toString(16)}, PID: ${info.usbProductId.toString(16)})`
      }
      
      // Actualizar el campo de puerto con el nombre
      setNewConnection({
        ...newConnection,
        config: { 
          ...newConnection.config, 
          port: portName,
          webSerialPort: true // Marcar que es un puerto Web Serial
        }
      })
      
      notify.success(t('connections.messages.serialPortSelected'))
    } catch (error) {
      if (error.name === 'NotFoundError') {
        // El usuario canceló la selección
        console.log('Selección de puerto cancelada')
      } else {
        console.error('Error seleccionando puerto serial:', error)
        notify.error(t('connections.messages.serialPortError'))
      }
    }
  }

  const formatConnectionInfo = (connection) => {
    switch(connection.type) {
      case 'serial':
        return `${connection.config.port} @ ${connection.config.baudrate}`
      case 'tcp':
        return `${connection.config.mode} - ${connection.config.ip}:${connection.config.port}`
      case 'udp':
        return `${connection.config.localIp}:${connection.config.localPort} ↔ ${connection.config.remoteIp}:${connection.config.remotePort}`
      default:
        return t('connections.configNotAvailable')
    }
  }

  return (
    <div className="settings-section">
      <div className="connections-header">
        <div>
          <h2 className="section-title">{t('connections.title')}</h2>
          <p className="section-description">
            {t('connections.description')}
          </p>
        </div>
        <button 
          className="btn-add"
          onClick={() => setShowAddModal(true)}
        >
          + {t('connections.addConnection')}
        </button>
      </div>

      {/* Lista de conexiones guardadas */}
      {connections.length === 0 ? (
        <div className="empty-state">
          <p>{t('connections.emptyState')}</p>
          <p className="empty-state-hint">{t('connections.emptyStateHint')}</p>
        </div>
      ) : (
        <div className="connections-list">
          {connections.map(connection => (
            <div key={connection.id} className="connection-card">
              <div className="connection-header">
                <div className="connection-icon">{getConnectionTypeIcon(connection.type)}</div>
                <div className="connection-info">
                  <h3 className="connection-name">{connection.name}</h3>
                  <p className="connection-type">{connection.type.toUpperCase()}</p>
                  <p className="connection-details">{formatConnectionInfo(connection)}</p>
                </div>
              </div>
              <div className="connection-actions">
                {activeConnection === connection.id ? (
                  <button 
                    className="btn-disconnect"
                    onClick={handleDisconnect}
                    title={t('connections.disconnect')}
                  >
                    ⏸️
                  </button>
                ) : (
                  <button 
                    className="btn-connect"
                    onClick={() => handleConnect(connection)}
                    disabled={connecting || activeConnection !== null}
                    title={t('connections.connect')}
                  >
                    {connecting ? '⏳' : '▶'}
                  </button>
                )}
                <button 
                  className="btn-delete"
                  onClick={() => handleDeleteConnection(connection.id)}
                  disabled={activeConnection === connection.id}
                  title={t('connections.delete')}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para añadir nueva conexión */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="add-connection-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t('connections.newConnection')}</h3>
            
            <div className="form-group">
              <label className="form-label">{t('connections.form.name')}</label>
              <input 
                type="text" 
                className="form-input"
                placeholder={t('connections.form.namePlaceholder')}
                value={newConnection.name}
                readOnly
                onClick={() => openKeyboard(t('connections.form.name'), 'name', newConnection.name, 'text')}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('connections.form.type')}</label>
              <select 
                className="form-input"
                value={newConnection.type}
                onChange={(e) => {
                  const type = e.target.value
                  let defaultConfig = {}
                  
                  // Establecer valores por defecto según el tipo
                  switch(type) {
                    case 'serial':
                      defaultConfig = { port: '/dev/ttyUSB0', baudrate: '115200' }
                      break
                    case 'tcp':
                      defaultConfig = { mode: 'Cliente', ip: '127.0.0.1', port: '5760' }
                      break
                    case 'udp':
                      defaultConfig = { localIp: '0.0.0.0', localPort: '14550', remoteIp: '', remotePort: '14555' }
                      break
                  }
                  
                  setNewConnection({ 
                    ...newConnection, 
                    type,
                    config: defaultConfig
                  })
                }}
              >
                <option value="serial">{t('connections.types.serial')}</option>
                <option value="tcp">{t('connections.types.tcp')}</option>
                <option value="udp">{t('connections.types.udp')}</option>
              </select>
            </div>

            {renderConnectionForm()}

            <div className="modal-actions">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setShowAddModal(false)
                  setNewConnection({ 
                    name: '', 
                    type: 'serial', 
                    config: {
                      port: '/dev/ttyUSB0',
                      baudrate: '115200'
                    }
                  })
                }}
              >
                {t('connections.form.cancel')}
              </button>
              <button 
                className="btn-primary"
                onClick={handleAddConnection}
              >
                {t('connections.form.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ParameterDownloadModal
        isOpen={showParamDownload}
        onClose={() => setShowParamDownload(false)}
      />

      <OnScreenKeyboard
        isOpen={keyboard.isOpen}
        onClose={closeKeyboard}
        onSubmit={handleKeyboardSubmit}
        fieldName={keyboard.fieldName}
        initialValue={keyboard.initialValue}
        keyboardType={keyboard.keyboardType}
      />
    </div>
  )
}

export default Connections
