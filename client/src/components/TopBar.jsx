import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './TopBar.css'

function TopBar({ onSettingsClick, isSettingsOpen, onArmDisarmRequest }) {
  const { t } = useTranslation()
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }))
  const [telemetry, setTelemetry] = useState({
    signal: 'N/A',
    battery: 'N/A',
    gps: 'N/A',
    armed: false,
    flightMode: 'N/A',
    systemId: null,
    custom_mode: 0,
    vehicleType: null
  })
  const [hasTelemetry, setHasTelemetry] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [showFlightModeDropdown, setShowFlightModeDropdown] = useState(false)
  const [availableFlightModes, setAvailableFlightModes] = useState({})
  const [showArmDropdown, setShowArmDropdown] = useState(false)
  const dropdownRef = useRef(null)
  const armDropdownRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Verificar estado de conexión
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/mavlink/status')
        const result = await response.json()
        setIsConnected(result.connected)
      } catch (error) {
        setIsConnected(false)
      }
    }
    
    checkConnection()
    const interval = setInterval(checkConnection, 500)
    return () => clearInterval(interval)
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
    }

    if (showFlightModeDropdown || showArmDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFlightModeDropdown, showArmDropdown])

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
    try {
      const response = await fetch('/api/mavlink/flightmode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemId: telemetry.systemId,
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
    if (onArmDisarmRequest && telemetry.systemId) {
      onArmDisarmRequest('arm', telemetry.systemId)
    }
  }

  const handleDisarmClick = () => {
    setShowArmDropdown(false)
    if (onArmDisarmRequest && telemetry.systemId) {
      onArmDisarmRequest('disarm', telemetry.systemId)
    }
  }

  useEffect(() => {
    // Cargar telemetría del vehículo principal
    const loadTelemetry = async () => {
      try {
        // Primero obtener lista de vehículos
        const vehiclesResponse = await fetch('/api/mavlink/vehicles')
        if (!vehiclesResponse.ok) {
          setHasTelemetry(false)
          setTelemetry({
            signal: 'N/A',
            battery: 'N/A',
            gps: 'N/A',
            armed: false
          })
          return
        }
        
        const vehicles = await vehiclesResponse.json()
        
        // Si no hay vehículos, no hay telemetría
        if (!vehicles || vehicles.length === 0) {
          setHasTelemetry(false)
          setTelemetry({
            signal: 'N/A',
            battery: 'N/A',
            gps: 'N/A',
            armed: false,
            flightMode: 'N/A'
          })
          return
        }
        
        // Tomar el primer vehículo disponible
        const vehicle = vehicles[0]
        
        // Verificar si hay telemetría activa (datos recientes)
        const isActive = vehicle.connected && vehicle.lastUpdate && 
                        (Date.now() - vehicle.lastUpdate < 5000)
        setHasTelemetry(isActive)
        
        if (!isActive) {
          setTelemetry({
            signal: 'N/A',
            battery: 'N/A',
            gps: 'N/A',
            armed: false,
            flightMode: 'N/A'
          })
          return
        }
        
        // Calcular calidad de señal
        let signalQuality = t('topbar.signalQuality.noSignal')
        if (vehicle.signal_strength > 80) signalQuality = t('topbar.signalQuality.excellent')
        else if (vehicle.signal_strength > 60) signalQuality = t('topbar.signalQuality.good')
        else if (vehicle.signal_strength > 40) signalQuality = t('topbar.signalQuality.regular')
        else if (vehicle.signal_strength > 0) signalQuality = t('topbar.signalQuality.weak')
        
        // Estado GPS
        let gpsStatus = t('topbar.gpsStatus.noGps')
        const fixType = vehicle.gps_fix_type ?? vehicle.fix_type ?? 0
        const satellites = vehicle.gps_satellites ?? vehicle.satellites_visible ?? 0
        
        // MAVLink GPS fix types: 0=No GPS, 1=No Fix, 2=2D Fix, 3=3D Fix, 4=DGPS, 5=RTK Float, 6=RTK Fixed
        if (fixType >= 3 && satellites >= 6) {
          gpsStatus = `${t('topbar.gpsStatus.fix3d')} (${satellites})`
        } else if (fixType === 2) {
          gpsStatus = t('topbar.gpsStatus.fix2d')
        } else if (fixType === 1) {
          gpsStatus = t('topbar.gpsStatus.noFix')
        }
        
        setTelemetry({
          signal: signalQuality,
          battery: `${vehicle.battery_remaining?.toFixed(0)}%`,
          gps: gpsStatus,
          armed: !!(vehicle.base_mode & 128), // MAV_MODE_FLAG_SAFETY_ARMED = 128
          flightMode: vehicle.flightMode || 'Unknown',
          systemId: vehicle.systemId,
          custom_mode: vehicle.custom_mode || 0,
          vehicleType: vehicle.type
        })
        
        // Actualizar modos disponibles
        setAvailableFlightModes(getFlightModesForVehicleType(vehicle.type))
      } catch (error) {
        // Si hay error de red o cualquier otro error, no hay telemetría
        setHasTelemetry(false)
        setTelemetry({
          signal: 'N/A',
          battery: 'N/A',
          gps: 'N/A',
          armed: false,
          flightMode: 'N/A'
        })
      }
    }
    
    loadTelemetry()
    const interval = setInterval(loadTelemetry, 1000)
    
    return () => clearInterval(interval)
  }, [t])

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
        console.log(`Probando conexión: ${connection.name}...`)
        
        try {
          const response = await fetch('/api/mavlink/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: connection.type, config: connection.config })
          })
          const result = await response.json()
          
          if (result.success) {
            console.log(`✓ Conectado con: ${connection.name}`)
            localStorage.setItem('mavlink_active_connection', JSON.stringify(connection.id))
            setIsConnected(true)
            
            // Solicitar parámetros después de conectar
            // Verificar si es modo servidor TCP (no solicitar parámetros aún)
            const isTcpServer = connection.type === 'tcp' && connection.config.mode === 'Servidor'
            
            if (!isTcpServer) {
              // Para serial o TCP cliente, solicitar parámetros inmediatamente
              try {
                await fetch('/api/mavlink/parameters/request', { method: 'POST' })
                console.log('Solicitud de parámetros enviada')
              } catch (error) {
                console.error('Error solicitando parámetros:', error)
              }
            }
            
            setConnecting(false)
            return // Salir al encontrar conexión exitosa
          }
        } catch (error) {
          console.log(`✗ Falló: ${connection.name}`)
          continue // Probar siguiente conexión
        }
      }
      
      console.log('No se pudo conectar con ninguna conexión')
      setConnecting(false)
    } catch (error) {
      console.error('Error en auto-connect:', error)
      setConnecting(false)
    }
  }

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        {/* Vehículo seleccionado */}
        <div className="indicator">
          <span className="indicator-icon">🚁</span>
          <span className="indicator-label">{t('topbar.vehicle')}</span>
          <span className="indicator-value">{hasTelemetry ? '#1' : 'N/A'}</span>
        </div>
        
        {/* Estado Armado/Desarmado */}
        {hasTelemetry && (
          <div style={{ position: 'relative' }}>
            <div className={`indicator ${telemetry.armed ? 'armed' : 'disarmed'} clickable`}
                 onClick={(e) => {
                   e.stopPropagation()
                   setShowArmDropdown(!showArmDropdown)
                   setShowFlightModeDropdown(false)
                 }}>
              <span className="indicator-icon">{telemetry.armed ? '🔓' : '🔒'}</span>
              <span className="indicator-label">{t('topbar.status')}</span>
              <span className="indicator-value">{telemetry.armed ? t('topbar.armed') : t('topbar.disarmed')}</span>
            </div>
            
            {showArmDropdown && (
              <div className="arm-dropdown" ref={armDropdownRef}>
                <div
                  className={`arm-dropdown-option arm-option ${telemetry.armed ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!telemetry.armed) {
                      handleArmClick()
                    }
                  }}
                >
                  <span className="option-icon">🔓</span>
                  <span>{t('sidebar.actions.arm')}</span>
                </div>
                <div
                  className={`arm-dropdown-option disarm-option ${!telemetry.armed ? 'disabled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (telemetry.armed) {
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
              <span className="indicator-value">{telemetry.flightMode}</span>
            </div>
            
            {showFlightModeDropdown && (
              <div className="flight-mode-dropdown" ref={dropdownRef}>
                {Object.entries(availableFlightModes).map(([mode, name]) => (
                  <div
                    key={mode}
                    className={`flight-mode-option ${parseInt(mode) === telemetry.custom_mode ? 'active' : ''}`}
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
          <span className="indicator-value">{telemetry.signal}</span>
        </div>
        
        {/* Batería */}
        <div className="indicator">
          <span className="indicator-icon">🔋</span>
          <span className="indicator-label">{t('topbar.battery')}</span>
          <span className="indicator-value">{telemetry.battery}</span>
        </div>
        
        {/* GPS */}
        <div className="indicator">
          <span className="indicator-icon">📍</span>
          <span className="indicator-label">{t('topbar.gps')}</span>
          <span className="indicator-value">{telemetry.gps}</span>
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
  )
}

export default TopBar
