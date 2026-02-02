import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './Connections.css'
import ParameterDownloadModal from '../ParameterDownloadModal'
import OnScreenKeyboard from '../OnScreenKeyboard'
import { useNotification } from '../../contexts/NotificationContext'
import { useWebSocketContext } from '../../contexts/WebSocketContext'
import { useConnections } from '../../contexts/ConnectionsContext'
import apiClient from '../../services/api'

function Connections() {
  const { t } = useTranslation()
  const notify = useNotification()
  const { connectionStatus, connectToMavlink, disconnectFromMavlink } = useWebSocketContext()
  const { 
    connections, 
    activeConnectionId, 
    addConnection, 
    updateConnection, 
    deleteConnection 
  } = useConnections()
  const [connecting, setConnecting] = useState(false)
  const [showParamDownload, setShowParamDownload] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [keyboard, setKeyboard] = useState({ isOpen: false, fieldName: '', fieldKey: '', initialValue: '', keyboardType: 'text' })
  const [serialPorts, setSerialPorts] = useState([])
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [newConnection, setNewConnection] = useState({
    name: '',
    type: 'serial',
    config: {
      port: '/dev/ttyACM0',
      baudrate: '115200'
    }
  })

  const handleDisconnect = async () => {
    try {
      await disconnectFromMavlink({ silent: true })
      console.log('Desconectado exitosamente')
    } catch (error) {
      console.error('Error desconectando:', error)
      notify.error(t('connections.messages.disconnectError'))
    }
  }

  const handleConnect = async (connection, isAutoConnect = false) => {
    setConnecting(true)
    
    try {
      const result = await connectToMavlink(connection, { 
        isAutoConnect, 
        silent: false, 
        requestParams: true 
      })
      
      if (result.success) {
        console.log('Conexión establecida:', connection.name)
        
        // Verificar si es modo servidor TCP
        const isTcpServer = connection.type === 'tcp' && connection.config.mode === 'Servidor'
        
        if (!isTcpServer && !isAutoConnect) {
          setShowParamDownload(true)
        }
      }
    } catch (error) {
      console.error('Error conectando:', error)
    } finally {
      setConnecting(false)
    }
  }

  const handleAddConnection = async () => {
    if (!newConnection.name.trim()) {
      notify.error(t('connections.messages.nameRequired'))
      return
    }

    const connection = await addConnection(newConnection)
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
        port: '/dev/ttyACM0',
        baudrate: '115200'
      }
    })
  }

  const handleDeleteConnection = async (id) => {
    // Si es la conexión activa, desconectar primero
    if (activeConnectionId === id) {
      await handleDisconnect()
    }
    
    await deleteConnection(id)
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

  // Cargar puertos seriales disponibles
  const loadSerialPorts = async () => {
    setLoadingPorts(true)
    try {
      const data = await apiClient.getSerialPorts()
      if (data.success && data.ports.length > 0) {
        setSerialPorts(data.ports)
        // Usar el primer puerto detectado si el actual no está en la lista
        const currentPort = newConnection.config.port
        const portExists = data.ports.some(p => p.path === currentPort)
        if (!portExists) {
          setNewConnection({
            ...newConnection,
            config: { ...newConnection.config, port: data.ports[0].path }
          })
        }
      } else {
        setSerialPorts([])
      }
    } catch (error) {
      console.error('Error cargando puertos seriales:', error)
      setSerialPorts([])
    } finally {
      setLoadingPorts(false)
    }
  }

  // Cargar puertos cuando se abre el modal de añadir conexión serial
  useEffect(() => {
    if (showAddModal && newConnection.type === 'serial') {
      loadSerialPorts()
    }
  }, [showAddModal, newConnection.type])

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
                  value={newConnection.config.port || '/dev/ttyACM0'}
                  onChange={(e) => setNewConnection({
                    ...newConnection,
                    config: { ...newConnection.config, port: e.target.value }
                  })}
                  disabled={loadingPorts}
                >
                  {loadingPorts ? (
                    <option>{t('connections.form.detectingPorts')}</option>
                  ) : serialPorts.length > 0 ? (
                    serialPorts.map(port => (
                      <option key={port.path} value={port.path}>
                        {port.description}
                      </option>
                    ))
                  ) : (
                    <>
                      <option>/dev/ttyACM0</option>
                      <option>/dev/ttyUSB0</option>
                      <option>/dev/ttyAMA0</option>
                    </>
                  )}
                </select>
                <button 
                  type="button"
                  className="btn-select-port"
                  onClick={loadSerialPorts}
                  disabled={loadingPorts}
                  title={t('connections.form.refreshPorts')}
                >
                  {loadingPorts ? '⟳' : '🔄'}
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
                      defaultConfig = { port: '/dev/ttyACM0', baudrate: '115200' }
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
                      port: '/dev/ttyACM0',
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
