import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
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

const FlightModes = forwardRef(({ systemId }, ref) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flightModes, setFlightModes] = useState({})
  const [flightModeChannel, setFlightModeChannel] = useState(5)
  const [originalValues, setOriginalValues] = useState({})
  const [modified, setModified] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [vehicleType, setVehicleType] = useState(null)
  const [availableModes, setAvailableModes] = useState(COPTER_MODES)

  // Exponer métodos al componente padre
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => modified,
    saveChanges: handleSave,
    resetChanges: () => {
      // Restaurar valores originales
      const { channel, ...modes } = originalValues
      setFlightModes(modes)
      setFlightModeChannel(channel || 5)
      setModified(false)
      setMessage({ text: '', type: '' })
    }
  }))

  useEffect(() => {
    loadVehicleType()
  }, [systemId])

  useEffect(() => {
    if (vehicleType !== null) {
      loadFlightModes()
    }
  }, [vehicleType])

  const loadVehicleType = async () => {
    try {
      const response = await fetch('/api/mavlink/vehicles')
      const vehicles = await response.json()
      const vehicle = vehicles.find(v => v.systemId === systemId) || vehicles[0]
      
      if (vehicle) {
        setVehicleType(vehicle.type)
        // Seleccionar los modos disponibles según el tipo de vehículo
        if (vehicle.type === 1) {
          setAvailableModes(PLANE_MODES)
        } else if ([2, 3, 4, 13, 14, 15].includes(vehicle.type)) {
          setAvailableModes(COPTER_MODES)
        } else if (vehicle.type === 10) {
          setAvailableModes(ROVER_MODES)
        } else {
          setAvailableModes(COPTER_MODES) // default
        }
      }
    } catch (error) {
      console.error('Error loading vehicle type:', error)
    }
  }

  const showMessage = (text, type) => {
    setMessage({ text, type })
    setTimeout(() => setMessage({ text: '', type: '' }), 3000)
  }

  const loadFlightModes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/mavlink/parameters')
      const data = await response.json()
      
      if (data.parameters) {
        const modes = {}
        let channel = 5
        
        data.parameters.forEach(param => {
          // Buscar parámetros FLTMODE1 a FLTMODE6
          const modeMatch = param.name.match(/^FLTMODE(\d)$/)
          if (modeMatch) {
            const slotNum = parseInt(modeMatch[1])
            modes[slotNum] = parseInt(param.value)
          }
          
          // Buscar parámetro FLTMODE_CH
          if (param.name === 'FLTMODE_CH') {
            channel = parseInt(param.value)
          }
        })
        
        setFlightModes(modes)
        setFlightModeChannel(channel)
        setOriginalValues({ ...modes, channel })
        setModified(false)
      }
    } catch (error) {
      console.error('Error loading flight modes:', error)
      showMessage(t('flightModes.errorLoading'), 'error')
    } finally {
      setLoading(false)
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
    let isModified = false
    
    // Check if any mode changed
    for (let i = 1; i <= 6; i++) {
      if (modes[i] !== originalValues[i]) {
        isModified = true
        break
      }
    }
    
    // Check if channel changed
    if (channel !== originalValues.channel) {
      isModified = true
    }
    
    setModified(isModified)
  }

  const handleSave = async () => {
    if (!modified) {
      showMessage(t('flightModes.noChanges'), 'info')
      return
    }

    setSaving(true)
    try {
      const promises = []
      
      // Save flight modes
      for (let i = 1; i <= 6; i++) {
        if (flightModes[i] !== originalValues[i]) {
          const paramName = `FLTMODE${i}`
          promises.push(
            fetch('/api/mavlink/parameters/set', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: paramName, value: flightModes[i] })
            })
          )
        }
      }
      
      // Save channel if changed
      if (flightModeChannel !== originalValues.channel) {
        promises.push(
          fetch('/api/mavlink/parameters/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'FLTMODE_CH', value: flightModeChannel })
          })
        )
      }
      
      const results = await Promise.all(promises)
      const allSuccess = results.every(r => r.ok)
      
      if (allSuccess) {
        showMessage(t('flightModes.successSave'), 'success')
        // Reload to get updated values
        setTimeout(() => loadFlightModes(), 500)
      } else {
        showMessage(t('flightModes.errorSave'), 'error')
      }
    } catch (error) {
      console.error('Error saving flight modes:', error)
      showMessage(t('flightModes.errorSave'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const getModeName = (value) => {
    const name = availableModes[value]
    if (name) {
      return t(`flightModes.modes.${name}`, name)
    }
    return t('flightModes.modes.Unknown', `Unknown (${value})`)
  }

  if (loading) {
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
            onClick={handleSave}
            disabled={!modified || saving}
            className={`save-button ${modified ? 'modified' : ''}`}
          >
            {saving ? t('flightModes.saving') : 
             modified ? t('flightModes.saveChanges') : 
             t('flightModes.noChanges')}
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Channel Selector */}
      <div className="channel-selector-container">
        <label className="channel-label">
          <span className="label-icon">📻</span>
          <span className="label-text">{t('flightModes.channel')}</span>
        </label>
        <select
          className={`channel-select ${flightModeChannel !== originalValues.channel ? 'modified' : ''}`}
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
              {flightModes[slot] !== originalValues[slot] && <span className="modified-indicator">*</span>}
            </label>
            <select
              className={`mode-select ${flightModes[slot] !== originalValues[slot] ? 'modified' : ''}`}
              value={flightModes[slot] || 0}
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
