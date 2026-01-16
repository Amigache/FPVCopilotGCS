import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotification } from '../../contexts/NotificationContext'
import useVehicleConfigSection from '../../hooks/useVehicleConfigSection'
import './common.css'
import './SerialPorts.css'

const SerialPorts = forwardRef(({ systemId }, ref) => {
  const { t } = useTranslation()
  const notify = useNotification()
  const [serialPorts, setSerialPorts] = useState([])
  const [error, setError] = useState(null)

  // Protocolos comunes de ArduPilot
  const protocols = {
    '-1': 'None',
    '1': 'MAVLink1',
    '2': 'MAVLink2',
    '3': 'Frsky D',
    '4': 'Frsky SPort',
    '5': 'GPS',
    '7': 'Alexmos Gimbal Serial',
    '8': 'SToRM32 Gimbal Serial',
    '9': 'Rangefinder',
    '10': 'FrSky SPort Passthrough',
    '11': 'Lidar360',
    '13': 'Beacon',
    '14': 'Volz servo out',
    '15': 'SBus servo out',
    '16': 'ESC Telemetry',
    '17': 'Devo Telemetry',
    '18': 'OpticalFlow',
    '19': 'RobotisServo',
    '20': 'NMEA Output',
    '21': 'WindVane',
    '22': 'SLCAN',
    '23': 'RCIN',
    '24': 'EFI Serial',
    '25': 'LTM',
    '26': 'RunCam',
    '27': 'HottTelem',
    '28': 'Scripting',
    '29': 'Crossfire VTX',
    '30': 'Generator',
    '31': 'Winch',
    '32': 'MSP',
    '33': 'DJI FPV',
    '34': 'AirSpeed',
    '35': 'ADSB',
    '36': 'AHRS',
    '37': 'SmartAudio',
    '38': 'FETtecOneWire',
    '39': 'Torqeedo',
    '40': 'AIS',
    '41': 'CoDevESC',
    '42': 'DisplayPort',
    '43': 'MAVLink High Latency',
    '44': 'IRC Tramp',
    '45': 'DDS XRCE'
  }

  // Mapeo de valores de BAUD en ArduPilot
  // ArduPilot usa códigos específicos, no baudrates directos
  const baudRateMap = {
    '1': '1200',
    '2': '2400',
    '4': '4800',
    '9': '9600',
    '19': '19200',
    '38': '38400',
    '57': '57600',
    '111': '111100',
    '115': '115200',
    '230': '230400',
    '256': '256000',
    '460': '460800',
    '500': '500000',
    '921': '921600',
    '1500': '1500000',
    '2000': '2000000'
  }

  // Para el select, mostrar en orden
  const baudRates = [
    { code: '0', rate: 'Default' },
    { code: '1', rate: '1200' },
    { code: '2', rate: '2400' },
    { code: '4', rate: '4800' },
    { code: '9', rate: '9600' },
    { code: '19', rate: '19200' },
    { code: '38', rate: '38400' },
    { code: '57', rate: '57600' },
    { code: '111', rate: '111100' },
    { code: '115', rate: '115200' },
    { code: '230', rate: '230400' },
    { code: '256', rate: '256000' },
    { code: '460', rate: '460800' },
    { code: '500', rate: '500000' },
    { code: '921', rate: '921600' },
    { code: '1500', rate: '1500000' },
    { code: '2000', rate: '2000000' }
  ]

  // Función para cargar datos desde el Map de parámetros
  const loadDataFn = useCallback(async (paramsMap) => {
    const ports = []
    for (let i = 0; i < 8; i++) {
      const protocolParam = paramsMap.get(`SERIAL${i}_PROTOCOL`)
      const baudParam = paramsMap.get(`SERIAL${i}_BAUD`)
      
      const protocolValue = protocolParam ? protocolParam.value : null
      const baudValue = baudParam ? baudParam.value : null

      let baudCode = '57'
      if (baudValue !== null) {
        const baudValueInt = Math.round(baudValue)
        baudCode = baudValueInt.toString()
        
        const validCode = baudRates.find(b => b.code === baudCode)
        if (!validCode && baudValueInt !== 0) {
          baudCode = '57'
        }
      }

      ports.push({
        index: i,
        name: `SERIAL${i}`,
        protocol: protocolValue !== null ? protocolValue.toString() : '-1',
        baud: baudCode
      })
    }
    
    setSerialPorts(ports)
    
    const original = {}
    ports.forEach(port => {
      original[`SERIAL${port.index}_PROTOCOL`] = port.protocol
      original[`SERIAL${port.index}_BAUD`] = port.baud
    })
    
    if (ports.every(p => p.protocol === '-1')) {
      setError(t('serialPorts.noParameters'))
    } else {
      setError(null)
    }
    
    return { originalValues: original }
  }, [t])

  // Función para obtener parámetros modificados
  const getChangedParams = useCallback(() => {
    const paramsToUpdate = []
    
    for (const port of serialPorts) {
      if (port.protocol !== configSection.originalValues[`SERIAL${port.index}_PROTOCOL`]) {
        paramsToUpdate.push({
          name: `SERIAL${port.index}_PROTOCOL`,
          value: parseFloat(port.protocol)
        })
      }
      
      if (port.baud !== configSection.originalValues[`SERIAL${port.index}_BAUD`]) {
        paramsToUpdate.push({
          name: `SERIAL${port.index}_BAUD`,
          value: parseFloat(port.baud)
        })
      }
    }
    
    return paramsToUpdate
  }, [serialPorts])

  // Callback después de guardar
  const onSaveSuccess = useCallback(() => {
    const newOriginal = {}
    serialPorts.forEach(port => {
      newOriginal[`SERIAL${port.index}_PROTOCOL`] = port.protocol
      newOriginal[`SERIAL${port.index}_BAUD`] = port.baud
    })
    configSection.updateOriginalValues(newOriginal)
  }, [serialPorts])

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
      const restoredPorts = serialPorts.map(port => ({
        ...port,
        protocol: configSection.originalValues[`SERIAL${port.index}_PROTOCOL`] || '-1',
        baud: configSection.originalValues[`SERIAL${port.index}_BAUD`] || '57'
      }))
      setSerialPorts(restoredPorts)
      configSection.resetChanges()
      setError(null)
    }
  }))

  useEffect(() => {
    configSection.loadData()
  }, [systemId])

  const handleProtocolChange = (index, value) => {
    const updatedPorts = serialPorts.map(port => 
      port.index === index ? { ...port, protocol: value } : port
    )
    setSerialPorts(updatedPorts)
    checkIfModified(updatedPorts)
  }

  const handleBaudChange = (index, value) => {
    const updatedPorts = serialPorts.map(port => 
      port.index === index ? { ...port, baud: value } : port
    )
    setSerialPorts(updatedPorts)
    checkIfModified(updatedPorts)
  }

  const checkIfModified = (ports) => {
    let isModified = false
    
    for (const port of ports) {
      if (port.protocol !== configSection.originalValues[`SERIAL${port.index}_PROTOCOL`] ||
          port.baud !== configSection.originalValues[`SERIAL${port.index}_BAUD`]) {
        isModified = true
        break
      }
    }
    
    if (isModified) {
      configSection.markAsModified()
    }
  }

  if (configSection.loading) {
    return (
      <div className="config-section">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('serialPorts.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="config-section">
      <div className="section-header">
        <div className="header-left">
          <h3 className="section-title">{t('serialPorts.title')}</h3>
          <p className="section-description">{t('serialPorts.description')}</p>
        </div>
        <div className="header-right">
          <button
            onClick={() => configSection.saveChanges()}
            disabled={!configSection.modified || configSection.saving}
            className={`save-button ${configSection.modified ? 'modified' : ''}`}
          >
            {configSection.saving ? t('serialPorts.saving') : 
             configSection.modified ? t('serialPorts.saveChanges') : 
             t('serialPorts.noChanges')}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      <div className="serial-ports-grid">
        {serialPorts.map(port => {
          const isModified = port.protocol !== configSection.originalValues[`SERIAL${port.index}_PROTOCOL`] ||
                            port.baud !== configSection.originalValues[`SERIAL${port.index}_BAUD`]
          return (
          <div key={port.index} className="serial-port-card">
            <div className="serial-port-header">
              <span className="serial-port-icon">🔌</span>
              <h4>
                {port.name}
                {isModified && <span className="modified-indicator">*</span>}
              </h4>
            </div>

            <div className="serial-port-config">
              <div className="config-group">
                <label htmlFor={`protocol-${port.index}`}>
                  {t('serialPorts.protocol')}
                </label>
                <select
                  id={`protocol-${port.index}`}
                  value={port.protocol}
                  onChange={(e) => handleProtocolChange(port.index, e.target.value)}
                  className="serial-select"
                >
                  {Object.entries(protocols).map(([value, name]) => (
                    <option key={value} value={value}>
                      {t(`serialPorts.protocols.${name}`, name)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="config-group">
                <label htmlFor={`baud-${port.index}`}>
                  {t('serialPorts.baudRate')}
                </label>
                <select
                  id={`baud-${port.index}`}
                  value={port.baud}
                  onChange={(e) => handleBaudChange(port.index, e.target.value)}
                  className="serial-select"
                >
                  {baudRates.map(({ code, rate }) => (
                    <option key={code} value={code}>
                      {rate}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          )
        })}
      </div>

      <div className="info-box">
        <h4>{t('serialPorts.infoTitle')}</h4>
        <ul>
          <li>{t('serialPorts.info1')}</li>
          <li>{t('serialPorts.info2')}</li>
          <li>{t('serialPorts.info3')}</li>
        </ul>
      </div>

    </div>
  )
})

SerialPorts.displayName = 'SerialPorts'

export default SerialPorts
