import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import ParameterDownloadModal from './ParameterDownloadModal'
import './TopBar.css'

function TopBar({ onSettingsClick, isSettingsOpen, onArmDisarmRequest }) {
  const { t } = useTranslation()
  const { 
    selectedVehicle, 
    selectedVehicleId, 
    setSelectedVehicleId, 
    vehicles, 
    connectionStatus 
  } = useWebSocketContext()
  
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }))
  const [connecting, setConnecting] = useState(false)
  const [showParamDownload, setShowParamDownload] = useState(false)
  const [showFlightModeDropdown, setShowFlightModeDropdown] = useState(false)
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
      const response = await fetch('/api/mavlink/flightmode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemId: selectedVehicleId,
          customMode: parseInt(customMode)
        })
      })

      if (response.ok) {
        setShowFlightModeDropdown(false)
      }
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

  // Función para auto-conectar con la primera conexión válida
  const handleAutoConnect = async () => {
    if (connecting || isConnected) return
    
    setConnecting(true)
    try {
      // Obtener lista de conexiones guardadas
      const savedConnections = localStorage.getItem('mavlink_connections')
      if (!savedConnections) {
        console.log('No hay conexiones guardadas')
        setConnecting(false)
        return
      }

      const connections = JSON.parse(savedConnections)
      if (connections.length === 0) {
        console.log('Lista de conexiones vacía')
        setConnecting(false)
        return
      }

      // Probar cada conexión hasta encontrar una válida
      for (const connection of connections) {
        try {
          const response = await fetch('/api/mavlink/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: connection.type, config: connection.config })
          })
          const result = await response.json()
          
          if (result.success) {
            localStorage.setItem('mavlink_active_connection', JSON.stringify(connection.id))
            
            // Solicitar parámetros después de conectar
            // Verificar si es modo servidor TCP (no solicitar parámetros aún)
            const isTcpServer = connection.type === 'tcp' && connection.config.mode === 'Servidor'
            
            if (!isTcpServer) {
              // Para serial o TCP cliente, solicitar parámetros inmediatamente
              // Pequeño delay para asegurar que la conexión está establecida
              setTimeout(async () => {
                try {
                  const paramResponse = await fetch('/api/mavlink/parameters/request', { method: 'POST' })
                  const paramResult = await paramResponse.json()
                  
                  if (paramResult.success) {
                    setShowParamDownload(true)
                  }
                } catch (error) {
                  console.error('Error solicitando parámetros:', error)
                }
              }, 500)
            }
            
            setConnecting(false)
            return // Salir al encontrar conexión exitosa
          }
        } catch (error) {
          continue // Probar siguiente conexión
        }
      }
      
      setConnecting(false)
    } catch (error) {
      console.error('Error en auto-connect:', error)
      setConnecting(false)
    }
  }

  return (
    <>
      <div className="top-bar">
        <div className="top-bar-left">
          {/* Vehículo seleccionado */}
          <div className="indicator">
          <span className="indicator-icon">🚁</span>
          <span className="indicator-label">{t('topbar.vehicle')}</span>
          <span className="indicator-value">{selectedVehicle ? `#${selectedVehicleId}` : 'N/A'}</span>
        </div>
        
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
              <span className="indicator-icon">✈️</span>
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
        <div className="indicator">
          <span className="indicator-icon">📡</span>
          <span className="indicator-label">{t('topbar.signal')}</span>
          <span className="indicator-value">{getSignalQuality()}</span>
        </div>
        
        {/* Batería */}
        <div className="indicator">
          <span className="indicator-icon">🔋</span>
          <span className="indicator-label">{t('topbar.battery')}</span>
          <span className="indicator-value">{getBatteryStatus()}</span>
        </div>
        
        {/* GPS */}
        <div className="indicator">
          <span className="indicator-icon">📍</span>
          <span className="indicator-label">{t('topbar.gps')}</span>
          <span className="indicator-value">{getGPSStatus()}</span>
        </div>
        
        {/* Telemetría */}
        <div className={`indicator ${hasTelemetry ? 'telemetry-active' : 'telemetry-inactive'}`}>
          <span className="indicator-icon">{hasTelemetry ? '✓' : '✗'}</span>
          <span className="indicator-label">{t('topbar.telemetry')}</span>
          <span className="indicator-value">{hasTelemetry ? t('topbar.active') : t('topbar.inactive')}</span>
        </div>
      </div>
      
      <div className="top-bar-right">
        {!isConnected && (
          <button 
            className="connect-button"
            onClick={handleAutoConnect}
            disabled={connecting}
            title={t('topbar.autoConnect')}
          >
            {connecting ? '⏳' : '🔌'}
          </button>
        )}
        <div className="time">{currentTime}</div>
        <button 
          className={`settings-button ${isSettingsOpen ? 'active' : ''}`}
          onClick={onSettingsClick}
          title={t('topbar.settings')}
        >
          ⚙️
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
