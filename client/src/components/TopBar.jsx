import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import { useNotification } from '../contexts/NotificationContext'
import { useConnections } from '../contexts/ConnectionsContext'
import apiClient from '../services/api'
import ParameterDownloadModal from './ParameterDownloadModal'
import './TopBar.css'

function TopBar({ onSettingsClick, isSettingsOpen, onArmDisarmRequest }) {
  const { t } = useTranslation()
  const notify = useNotification()
  const { connections, getActiveConnection, loading, activeConnectionId } = useConnections()
  const { 
    selectedVehicle, 
    selectedVehicleId, 
    setSelectedVehicleId, 
    vehicles, 
    connectionStatus,
    connectToMavlink,
    disconnectFromMavlink
  } = useWebSocketContext()
  
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }))
  const [connecting, setConnecting] = useState(false)
  const [showParamDownload, setShowParamDownload] = useState(false)
  const [showFlightModeDropdown, setShowFlightModeDropdown] = useState(false)
  const autoConnectAttemptedRef = useRef(false) // Flag para evitar múltiples autoconexiones
  const autoConnectRunningRef = useRef(false) // Flag para prevenir ejecuciones concurrentes
  const [availableFlightModes, setAvailableFlightModes] = useState({})
  const [showArmDropdown, setShowArmDropdown] = useState(false)
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false)
  const dropdownRef = useRef(null)
  const armDropdownRef = useRef(null)
  const vehicleDropdownRef = useRef(null)

  // Estado de conexión desde WebSocket
  const isConnected = connectionStatus?.connected || false
  const hasTelemetry = selectedVehicle !== null

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowFlightModeDropdown(false)
      }
      if (armDropdownRef.current && !armDropdownRef.current.contains(event.target)) {
        setShowArmDropdown(false)
      }
      if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(event.target)) {
        setShowVehicleDropdown(false)
      }
    }

    if (showFlightModeDropdown || showArmDropdown || showVehicleDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFlightModeDropdown, showArmDropdown, showVehicleDropdown])

  const getFlightModesForVehicleType = (vehicleType) => {
    if (vehicleType === 1) {
      return {
        0: 'Manual', 1: 'Circle', 2: 'Stabilize', 3: 'Training', 4: 'Acro',
        5: 'FlyByWireA', 6: 'FlyByWireB', 7: 'Cruise', 8: 'Autotune',
        10: 'Auto', 11: 'RTL', 12: 'Loiter', 13: 'Takeoff', 14: 'Avoid_ADSB',
        15: 'Guided'
      }
    }
    if ([2, 3, 4, 13, 14, 15].includes(vehicleType)) {
      return {
        0: 'Stabilize', 1: 'Acro', 2: 'AltHold', 3: 'Auto', 4: 'Guided',
        5: 'Loiter', 6: 'RTL', 7: 'Circle', 9: 'Land', 15: 'AutoTune',
        16: 'PosHold', 21: 'Smart_RTL'
      }
    }
    if (vehicleType === 10) {
      return {
        0: 'Manual', 3: 'Steering', 4: 'Hold', 5: 'Loiter',
        10: 'Auto', 11: 'RTL', 15: 'Guided'
      }
    }
    return {}
  }

  const handleFlightModeChange = async (customMode) => {
    if (!selectedVehicleId) return
    
    try {
      await apiClient.setFlightMode(selectedVehicleId, parseInt(customMode))
      setShowFlightModeDropdown(false)
    } catch (error) {
      console.error('Error changing flight mode:', error)
    }
  }

  const handleArmClick = () => {
    setShowArmDropdown(false)
    if (onArmDisarmRequest && selectedVehicleId) {
      onArmDisarmRequest('arm', selectedVehicleId)
    }
  }

  const handleDisarmClick = () => {
    setShowArmDropdown(false)
    if (onArmDisarmRequest && selectedVehicleId) {
      onArmDisarmRequest('disarm', selectedVehicleId)
    }
  }

  // Actualizar modos de vuelo disponibles cuando cambia el vehículo seleccionado
  useEffect(() => {
    if (selectedVehicle) {
      setAvailableFlightModes(getFlightModesForVehicleType(selectedVehicle.type))
    }
  }, [selectedVehicle])

  // Autoconexión al iniciar la aplicación
  useEffect(() => {
    // Solo autoconectar si no está conectado, hay una conexión activa y no se ha intentado antes
    const checkAndAutoConnect = async () => {
      if (autoConnectAttemptedRef.current || isConnected || loading || connections.length === 0) {
        return;
      }
      
      // Si ya hay vehículos conectados, no intentar auto-conectar
      if (vehicles.length > 0) {
        console.log('✅ Ya hay vehículos conectados, saltando auto-conexión');
        autoConnectAttemptedRef.current = true;
        return;
      }
      
      const activeConnection = connections.find(c => c.id === activeConnectionId);
      if (activeConnection) {
        autoConnectAttemptedRef.current = true; // Marcar como intentado
        console.log('🔄 Auto-conectando a:', activeConnection.name);
        // Pequeño delay para asegurar que el WebSocket está listo
        setTimeout(() => {
          handleAutoConnect();
        }, 500);
      }
    };
    
    checkAndAutoConnect();
    
    // Cleanup: resetear el flag solo si está desmontando permanentemente (no Strict Mode)
    return () => {
      // No resetear el flag - queremos que persista entre re-montajes de Strict Mode
    };
  }, [isConnected, connections.length, loading, activeConnectionId, vehicles.length]); // Usar connections.length en lugar de connections

  // Calcular valores derivados de telemetría desde el vehículo seleccionado
  const getSignalQuality = () => {
    if (!selectedVehicle) return t('topbar.signalQuality.noSignal')
    const strength = selectedVehicle.signal_strength
    if (strength > 80) return t('topbar.signalQuality.excellent')
    if (strength > 60) return t('topbar.signalQuality.good')
    if (strength > 40) return t('topbar.signalQuality.regular')
    if (strength > 0) return t('topbar.signalQuality.weak')
    return t('topbar.signalQuality.noSignal')
  }

  const getBatteryStatus = () => {
    if (!isConnected || !selectedVehicle) return 'N/A'
    const remaining = selectedVehicle.battery_remaining
    return remaining != null ? `${remaining.toFixed(0)}%` : 'N/A'
  }

  const getGPSStatus = () => {
    if (!isConnected || !selectedVehicle) return t('topbar.gpsStatus.noGps')
    
    const fixType = selectedVehicle.gps_fix_type ?? selectedVehicle.fix_type ?? 0
    const satellites = selectedVehicle.gps_satellites ?? selectedVehicle.satellites_visible ?? 0
    
    if (fixType >= 3 && satellites >= 6) {
      return `${t('topbar.gpsStatus.fix3d')} (${satellites})`
    } else if (fixType === 2) {
      return t('topbar.gpsStatus.fix2d')
    } else if (fixType === 1) {
      return t('topbar.gpsStatus.noFix')
    }
    return t('topbar.gpsStatus.noGps')
  }

  const isArmed = () => {
    if (!isConnected || !selectedVehicle) return false
    return !!(selectedVehicle.base_mode & 128) // MAV_MODE_FLAG_SAFETY_ARMED = 128
  }

  const getFlightMode = () => {
    if (!isConnected || !selectedVehicle) return 'Unknown'
    return selectedVehicle.flightMode || 'Unknown'
  }

  // Función para obtener el emoji del vehículo según su tipo
  const getVehicleIcon = () => {
    if (!selectedVehicle) return '🚁'
    
    const vehicleType = selectedVehicle.vehicleType || selectedVehicle.type
    
    switch(vehicleType) {
      case 1: // Fixed wing
        return '✈️'
      case 4: // Helicopter
      case 3: // Coaxial helicopter
        return '🚁'
      case 10: // Ground rover
        return '🚗'
      case 2: // Quadrotor
      case 13: // Hexarotor
      case 14: // Octorotor
      case 15: // Tricopter
      default: // Multirotor/Copter
        return '🚁'
    }
  }

  // Función para auto-conectar con la primera conexión válida
  const handleAutoConnect = async () => {
    if (connecting || isConnected || autoConnectRunningRef.current) {
      console.log('⏭️ Ya conectado o conectando, saltando auto-conexión')
      return
    }
    
    autoConnectRunningRef.current = true
    setConnecting(true)
    try {
      if (connections.length === 0) {
        console.log('No hay conexiones guardadas')
        notify.error(t('topbar.connectionError.noSavedConnections'))
        setConnecting(false)
        autoConnectRunningRef.current = false
        return
      }

      const activeConnection = getActiveConnection()

      // Probar primero con la conexión activa, luego con las demás
      const ordered = activeConnection
        ? [activeConnection, ...connections.filter(c => c.id !== activeConnection.id)]
        : connections

      // Probar cada conexión hasta encontrar una válida
      for (const connection of ordered) {
        if (!connection) continue
        
        const result = await connectToMavlink(connection, { 
          isAutoConnect: true, 
          silent: false, 
          requestParams: true
        })
        
        if (result.success) {
          console.log('✅ Auto-conexión exitosa')
          setConnecting(false)
          autoConnectRunningRef.current = false
          // Mostrar modal de descarga de parámetros
          setShowParamDownload(true)
          return // Salir al encontrar conexión exitosa
        }
      }
      
      // Si llegamos aquí, no hubo conexión exitosa
      notify.error(t('topbar.connectionError.connectionFailed'))
      setConnecting(false)
      autoConnectRunningRef.current = false
    } catch (error) {
      console.error('Error en auto-connect:', error)
      notify.error(t('topbar.connectionError.connectionFailed'))
      setConnecting(false)
      autoConnectRunningRef.current = false
    }
  }

  // Función para desconectar
  const handleDisconnect = async () => {
    try {
      await disconnectFromMavlink({ silent: true })
      console.log('Desconectado exitosamente')
    } catch (error) {
      console.error('Error desconectando:', error)
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar-left">
          {/* Vehículo seleccionado */}
          {hasTelemetry && (
            <div className="indicator">
              <span className="indicator-icon">{getVehicleIcon()}</span>
              <span className="indicator-label">{t('topbar.vehicle')}</span>
              <span className="indicator-value">{selectedVehicle ? `#${selectedVehicleId}` : 'N/A'}</span>
            </div>
          )}
        
        {/* Estado Armado/Desarmado */}
        {hasTelemetry && (
          <div style={{ position: 'relative' }}>
            <div className={`indicator ${isArmed() ? 'armed' : 'disarmed'} clickable`}
                 onClick={(e) => {
                   e.stopPropagation()
                   setShowArmDropdown(!showArmDropdown)
                   setShowFlightModeDropdown(false)
                 }}>
              <span className="indicator-icon">{isArmed() ? '🔓' : '🔒'}</span>
              <span className="indicator-label">{t('topbar.status')}</span>
              <span className="indicator-value">{isArmed() ? t('topbar.armed') : t('topbar.disarmed')}</span>
            </div>
            
            {showArmDropdown && (
              <div className="arm-dropdown" ref={armDropdownRef}>
                <div
                  className={`arm-dropdown-option arm-option ${isArmed() ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isArmed()) {
                      handleArmClick()
                    }
                  }}
                >
                  <span className="option-icon">🔓</span>
                  <span>{t('sidebar.actions.arm')}</span>
                </div>
                <div
                  className={`arm-dropdown-option disarm-option ${!isArmed() ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isArmed()) {
                      handleDisarmClick()
                    }
                  }}
                >
                  <span className="option-icon">🔒</span>
                  <span>{t('sidebar.actions.disarm')}</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Modo de Vuelo */}
        {hasTelemetry && (
          <div style={{ position: 'relative' }}>
            <div className="indicator flight-mode clickable" 
                 onClick={(e) => {
                   e.stopPropagation()
                   setShowFlightModeDropdown(!showFlightModeDropdown)
                   setShowArmDropdown(false)
                 }}>
              <span className="indicator-icon">⚙️</span>
              <span className="indicator-label">{t('topbar.flightMode')}</span>
              <span className="indicator-value">{getFlightMode()}</span>
            </div>
            
            {showFlightModeDropdown && (
              <div className="flight-mode-dropdown" ref={dropdownRef}>
                {Object.entries(availableFlightModes).map(([mode, name]) => (
                  <div
                    key={mode}
                    className={`flight-mode-option ${parseInt(mode) === selectedVehicle?.custom_mode ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleFlightModeChange(mode)
                    }}
                  >
                    {t(`flightModes.modes.${name}`)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Señal */}
        {hasTelemetry && (
          <div className="indicator">
            <span className="indicator-icon">📡</span>
            <span className="indicator-label">{t('topbar.signal')}</span>
            <span className="indicator-value">{getSignalQuality()}</span>
          </div>
        )}
        
        {/* Batería */}
        {hasTelemetry && (
          <div className="indicator">
            <span className="indicator-icon">🔋</span>
            <span className="indicator-label">{t('topbar.battery')}</span>
            <span className="indicator-value">{getBatteryStatus()}</span>
          </div>
        )}
      </div>
      
      <div className="top-bar-right">
        <button 
          className={`connect-button ${isConnected ? 'disconnected' : ''}`}
          onClick={isConnected ? handleDisconnect : handleAutoConnect}
          disabled={connecting}
          title={isConnected ? 'Desconectar' : t('topbar.autoConnect')}
        >
          {connecting && (
            <span className="loading-spinner"></span>
          )}
          <span className={connecting ? 'icon-connecting' : ''}>
            {isConnected ? '🔌' : '🔌'}
          </span>
        </button>
        <button 
          className={`settings-button ${isSettingsOpen ? 'active' : ''}`}
          onClick={onSettingsClick}
          title={t('topbar.settings')}
        >
          {isSettingsOpen ? '📍' : '⚙️'}
        </button>
      </div>
    </div>

    {/* Modal de descarga de parámetros */}
    <ParameterDownloadModal
      isOpen={showParamDownload}
      onClose={() => setShowParamDownload(false)}
    />
    </>
  )
}

export default TopBar
