import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotification } from '../../contexts/NotificationContext'
import useVehicleConfigSection from '../../hooks/useVehicleConfigSection'
import './common.css'
import './FlightModes.css'

// Modos de vuelo de ArduPlane
const PLANE_MODES = {
  0: 'Manual',
  1: 'Circle',
  2: 'Stabilize',
  3: 'Training',
  4: 'Acro',
  5: 'FlyByWireA',
  6: 'FlyByWireB',
  7: 'Cruise',
  8: 'Autotune',
  10: 'Auto',
  11: 'RTL',
  12: 'Loiter',
  13: 'Takeoff',
  14: 'Avoid_ADSB',
  15: 'Guided',
  17: 'QStabilize',
  18: 'QHover',
  19: 'QLoiter',
  20: 'QLand',
  21: 'QRTL',
  22: 'QAutotune',
  23: 'QAcro',
  24: 'Thermal'
}

// Modos de vuelo de ArduCopter
const COPTER_MODES = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  5: 'Loiter',
  6: 'RTL',
  7: 'Circle',
  8: 'Position',
  9: 'Land',
  10: 'OF_Loiter',
  11: 'Drift',
  13: 'Sport',
  14: 'Flip',
  15: 'AutoTune',
  16: 'PosHold',
  17: 'Brake',
  18: 'Throw',
  19: 'Avoid_ADSB',
  20: 'Guided_NoGPS',
  21: 'Smart_RTL',
  22: 'FlowHold',
  23: 'Follow',
  24: 'ZigZag',
  25: 'SystemID',
  26: 'Heli_Autorotate',
  27: 'Auto_RTL'
}

// Modos de vuelo de ArduRover
const ROVER_MODES = {
  0: 'Manual',
  1: 'Acro',
  2: 'Learning',
  3: 'Steering',
  4: 'Hold',
  5: 'Loiter',
  6: 'Follow',
  7: 'Simple',
  10: 'Auto',
  11: 'RTL',
  12: 'SmartRTL',
  15: 'Guided'
}

const FlightModes = forwardRef(({ systemId, vehicle }, ref) => {
  const { t } = useTranslation()
  const notify = useNotification()
  const [flightModes, setFlightModes] = useState(null)
  const [flightModeChannel, setFlightModeChannel] = useState(5)
  const [vehicleType, setVehicleType] = useState(null)
  const [availableModes, setAvailableModes] = useState(COPTER_MODES)

  // Función para cargar datos desde el Map de parámetros
  const loadDataFn = useCallback(async (paramsMap) => {
    const modes = {}
    let channel = 5
    
    // Leer parámetros FLTMODE1 a FLTMODE6
    for (let i = 1; i <= 6; i++) {
      const param = paramsMap.get(`FLTMODE${i}`)
      if (param && param.value !== null) {
        modes[i] = parseInt(param.value)
      }
    }
    
    // Leer FLTMODE_CH
    const channelParam = paramsMap.get('FLTMODE_CH')
    if (channelParam && channelParam.value !== null) {
      channel = parseInt(channelParam.value)
    }
    
    setFlightModes(modes)
    setFlightModeChannel(channel)
    
    return {
      originalValues: { ...modes, channel }
    }
  }, [])

  // Función para obtener parámetros modificados
  const getChangedParams = useCallback(() => {
    const paramsToUpdate = []
    const { channel: originalChannel, ...originalModes } = configSection.originalValues
    
    // Modos de vuelo modificados
    for (let i = 1; i <= 6; i++) {
      if (flightModes[i] !== originalModes[i]) {
        paramsToUpdate.push({
          name: `FLTMODE${i}`,
          value: flightModes[i]
        })
      }
    }
    
    // Canal si cambió
    if (flightModeChannel !== originalChannel) {
      paramsToUpdate.push({
        name: 'FLTMODE_CH',
        value: flightModeChannel
      })
    }
    
    return paramsToUpdate
  }, [flightModes, flightModeChannel])

  // Callback después de guardar
  const onSaveSuccess = useCallback(() => {
    configSection.updateOriginalValues({ ...flightModes, channel: flightModeChannel })
  }, [flightModes, flightModeChannel])

  // Hook de configuración
  const configSection = useVehicleConfigSection({
    loadDataFn,
    getChangedParams,
    onSaveSuccess,
    t
  })

  // Exponer métodos al componente padre
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: configSection.hasUnsavedChanges,
    saveChanges: () => configSection.saveChanges(),
    resetChanges: () => {
      const { channel, ...modes } = configSection.resetChanges()
      setFlightModes(modes)
      setFlightModeChannel(channel || 5)
    }
  }))

  useEffect(() => {
    // Si tenemos el objeto vehículo, usarlo directamente
    if (vehicle) {
      setVehicleType(vehicle.type)
      if (vehicle.type === 1) {
        setAvailableModes(PLANE_MODES)
      } else if ([2, 3, 4, 13, 14, 15].includes(vehicle.type)) {
        setAvailableModes(COPTER_MODES)
      } else if (vehicle.type === 10) {
        setAvailableModes(ROVER_MODES)
      } else {
        setAvailableModes(COPTER_MODES)
      }
    } else {
      // Fallback: obtener del API
      loadVehicleType()
    }
  }, [systemId, vehicle])

  useEffect(() => {
    // Cargar datos cuando se determina el tipo de vehículo
    if (vehicleType !== null) {
      configSection.loadData()
    }
  }, [vehicleType])

  const loadVehicleType = async () => {
    try {
      const response = await fetch('/api/mavlink/vehicles')
      const vehicles = await response.json()
      const vehicleData = vehicles.find(v => v.systemId === systemId) || vehicles[0]
      
      if (vehicleData) {
        setVehicleType(vehicleData.type)
        if (vehicleData.type === 1) {
          setAvailableModes(PLANE_MODES)
        } else if ([2, 3, 4, 13, 14, 15].includes(vehicleData.type)) {
          setAvailableModes(COPTER_MODES)
        } else if (vehicleData.type === 10) {
          setAvailableModes(ROVER_MODES)
        } else {
          setAvailableModes(COPTER_MODES)
        }
      }
    } catch (error) {
      console.error('Error loading vehicle type:', error)
    }
  }

  const handleModeChange = (slot, newValue) => {
    const newValueInt = parseInt(newValue)
    
    setFlightModes(prev => ({
      ...prev,
      [slot]: newValueInt
    }))
    
    checkIfModified({ ...flightModes, [slot]: newValueInt }, flightModeChannel)
  }

  const handleChannelChange = (newValue) => {
    const newValueInt = parseInt(newValue)
    setFlightModeChannel(newValueInt)
    checkIfModified(flightModes, newValueInt)
  }

  const checkIfModified = (modes, channel) => {
    const { channel: originalChannel, ...originalModes } = configSection.originalValues
    let isModified = false
    
    // Check if any mode changed
    for (let i = 1; i <= 6; i++) {
      if (modes[i] !== originalModes[i]) {
        isModified = true
        break
      }
    }
    
    // Check if channel changed
    if (channel !== originalChannel) {
      isModified = true
    }
    
    if (isModified) {
      configSection.markAsModified()
    }
  }

  const getModeName = (value) => {
    const name = availableModes[value]
    if (name) {
      return t(`flightModes.modes.${name}`, name)
    }
    return t('flightModes.modes.Unknown', `Unknown (${value})`)
  }

  if (configSection.loading || flightModes === null) {
    return (
      <div className="config-section">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('flightModes.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="config-section">
      <div className="section-header">
        <div className="header-left">
          <h3 className="section-title">{t('flightModes.title')}</h3>
          <p className="section-description">{t('flightModes.description')}</p>
        </div>
        <div className="header-right">
          <button
            onClick={() => configSection.saveChanges()}
            disabled={!configSection.modified || configSection.saving}
            className={`save-button ${configSection.modified ? 'modified' : ''}`}
          >
            {configSection.saving ? t('flightModes.saving') : 
             configSection.modified ? t('flightModes.saveChanges') : 
             t('flightModes.noChanges')}
          </button>
        </div>
      </div>

      {/* Channel Selector */}
      <div className="channel-selector-container">
        <label className="channel-label">
          <span className="label-icon">📻</span>
          <span className="label-text">{t('flightModes.channel')}</span>
        </label>
        <select
          className={`channel-select ${flightModeChannel !== configSection.originalValues.channel ? 'modified' : ''}`}
          value={flightModeChannel}
          onChange={(e) => handleChannelChange(e.target.value)}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map(ch => (
            <option key={ch} value={ch}>
              {t('flightModes.rcChannel')} {ch}
            </option>
          ))}
        </select>
      </div>

      {/* Flight Modes Grid */}
      <div className="flight-modes-grid">
        {[1, 2, 3, 4, 5, 6].map(slot => (
          <div key={slot} className="mode-item">
            <label className="mode-label">
              {t('flightModes.mode')} {slot}
              {flightModes[slot] !== configSection.originalValues[slot] && <span className="modified-indicator">*</span>}
            </label>
            <select
              className={`mode-select ${flightModes[slot] !== configSection.originalValues[slot] ? 'modified' : ''}`}
              value={flightModes[slot] !== undefined ? flightModes[slot] : 0}
              onChange={(e) => handleModeChange(slot, e.target.value)}
            >
              {Object.entries(availableModes).map(([value, name]) => (
                <option key={value} value={value}>
                  {t(`flightModes.modes.${name}`, name)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="info-box">
        <div className="info-title">
          <span className="info-icon">ℹ️</span>
          {t('flightModes.infoTitle')}
        </div>
        <ul className="info-list">
          <li>{t('flightModes.info1')}</li>
          <li>{t('flightModes.info2')}</li>
          <li>{t('flightModes.info3')}</li>
        </ul>
      </div>
    </div>
  )
})

FlightModes.displayName = 'FlightModes'

export default FlightModes
