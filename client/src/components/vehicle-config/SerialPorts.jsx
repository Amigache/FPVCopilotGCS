import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import './common.css'
import './SerialPorts.css'
import Modal from '../Modal'

const SerialPorts = forwardRef(({ systemId }, ref) => {
  const { t } = useTranslation()
  const [serialPorts, setSerialPorts] = useState([])
  const [originalValues, setOriginalValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modified, setModified] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [isLoadingRef, setIsLoadingRef] = useState(false)

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

  // Exponer métodos al componente padre
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => modified,
    saveChanges: handleSave,
    resetChanges: () => {
      // Restaurar valores originales
      const restoredPorts = serialPorts.map(port => ({
        ...port,
        protocol: originalValues[`SERIAL${port.index}_PROTOCOL`] || '-1',
        baud: originalValues[`SERIAL${port.index}_BAUD`] || '57'
      }))
      setSerialPorts(restoredPorts)
      setModified(false)
      setMessage({ text: '', type: '' })
      setError(null)
    }
  }))

  useEffect(() => {
    loadSerialPorts()
  }, [systemId])

  const showMessage = (text, type) => {
    setMessage({ text, type })
    setTimeout(() => setMessage({ text: '', type: '' }), 3000)
  }

  const loadSerialPorts = async () => {
    // Evitar llamadas múltiples simultáneas
    if (isLoadingRef) {
      console.log('loadSerialPorts: Ya hay una carga en progreso, saltando...')
      return
    }
    
    setIsLoadingRef(true)
    setLoading(true)
    setError(null)
    setMessage({ text: '', type: '' }) // Limpiar mensajes anteriores

    try {
      // Obtener todos los parámetros
      const response = await fetch('/api/mavlink/parameters')
      const data = await response.json()

      if (data.parameters) {
        const ports = []
        for (let i = 0; i < 8; i++) {
          const protocolParam = data.parameters.find(p => 
            p.name === `SERIAL${i}_PROTOCOL`
          )
          const baudParam = data.parameters.find(p => 
            p.name === `SERIAL${i}_BAUD`
          )

          // Para BAUD, necesitamos convertir el valor a string y buscarlo en nuestro mapa
          // El backend puede enviar valores como 115.0 o 115, necesitamos normalizar
          let baudCode = '57' // default
          if (baudParam) {
            const baudValue = Math.round(baudParam.value)
            baudCode = baudValue.toString()
            
            // Verificar que el código existe en nuestro mapa
            const validCode = baudRates.find(b => b.code === baudCode)
            if (!validCode && baudValue !== 0) {
              console.warn(`SERIAL${i}_BAUD: Código ${baudCode} no encontrado en baudRates, usando default 57`)
              baudCode = '57'
            }
          }

          ports.push({
            index: i,
            name: `SERIAL${i}`,
            protocol: protocolParam ? protocolParam.value.toString() : '-1',
            baud: baudCode
          })
        }
        
        setSerialPorts(ports)
        
        // Guardar valores originales usando los valores exactos de los puertos cargados
        const original = {}
        ports.forEach(port => {
          original[`SERIAL${port.index}_PROTOCOL`] = port.protocol
          original[`SERIAL${port.index}_BAUD`] = port.baud
        })
        setOriginalValues(original)

        // Si no hay parámetros, mostrar mensaje
        if (ports.every(p => p.protocol === '-1')) {
          setError(t('serialPorts.noParameters'))
        }
      } else {
        throw new Error('No parameters available')
      }
    } catch (err) {
      console.error('Error loading serial ports:', err)
      setError(t('serialPorts.errorLoading'))
      
      // Mostrar puertos con valores por defecto
      const defaultPorts = []
      for (let i = 0; i < 8; i++) {
        defaultPorts.push({
          index: i,
          name: `SERIAL${i}`,
          protocol: '-1',
          baud: '57'  // Código por defecto para 57600
        })
      }
      setSerialPorts(defaultPorts)
    } finally {
      setLoading(false)
      setIsLoadingRef(false)
    }
  }

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
      if (port.protocol !== originalValues[`SERIAL${port.index}_PROTOCOL`] ||
          port.baud !== originalValues[`SERIAL${port.index}_BAUD`]) {
        isModified = true
        break
      }
    }
    
    setModified(isModified)
  }

  const handleSave = async () => {
    if (!modified) {
      showMessage(t('serialPorts.noChanges'), 'info')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const promises = []
      
      // Solo enviar parámetros que han cambiado
      for (const port of serialPorts) {
        // Verificar si el protocolo cambió
        if (port.protocol !== originalValues[`SERIAL${port.index}_PROTOCOL`]) {
          promises.push(
            fetch('/api/mavlink/parameters/set', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `SERIAL${port.index}_PROTOCOL`,
                value: parseFloat(port.protocol)
              })
            })
          )
        }
        
        // Verificar si el baud rate cambió
        if (port.baud !== originalValues[`SERIAL${port.index}_BAUD`]) {
          promises.push(
            fetch('/api/mavlink/parameters/set', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `SERIAL${port.index}_BAUD`,
                value: parseFloat(port.baud)
              })
            })
          )
        }
      }

      if (promises.length === 0) {
        showMessage(t('serialPorts.noChanges'), 'info')
        return
      }

      const results = await Promise.all(promises)
      
      // Verificar respuestas
      const responses = await Promise.all(results.map(r => r.json()))
      const rejectedParams = responses.filter(r => !r.success)
      const successParams = responses.filter(r => r.success)
      
      if (rejectedParams.length > 0) {
        // Algunos parámetros fueron rechazados por el vehículo
        const rejectedNames = rejectedParams.map(r => r.message || 'Unknown').join(', ')
        showMessage(
          `${t('serialPorts.partialError')}: ${rejectedParams.length} ${t('serialPorts.rejected')}`,
          'warning'
        )
        // Recargar para obtener los valores reales del vehículo
        setTimeout(() => loadSerialPorts(), 1000)
      } else if (successParams.length > 0) {
        // Todos los parámetros fueron aceptados
        // Actualizar valores originales para que coincidan con los nuevos valores guardados
        const newOriginalValues = {}
        serialPorts.forEach(port => {
          newOriginalValues[`SERIAL${port.index}_PROTOCOL`] = port.protocol
          newOriginalValues[`SERIAL${port.index}_BAUD`] = port.baud
        })
        setOriginalValues(newOriginalValues)
        setModified(false)
        showMessage(t('serialPorts.successSave'), 'success')
      } else {
        showMessage(t('serialPorts.errorSave'), 'error')
      }
    } catch (err) {
      console.error('Error saving serial ports:', err)
      showMessage(t('serialPorts.errorSave'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
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
            onClick={handleSave}
            disabled={!modified || saving}
            className={`save-button ${modified ? 'modified' : ''}`}
          >
            {saving ? t('serialPorts.saving') : 
             modified ? t('serialPorts.saveChanges') : 
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
          const isModified = port.protocol !== originalValues[`SERIAL${port.index}_PROTOCOL`] ||
                            port.baud !== originalValues[`SERIAL${port.index}_BAUD`]
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

      <Modal
        isOpen={message.text !== ''}
        onClose={() => setMessage({ text: '', type: '' })}
        title={message.type === 'success' ? t('serialPorts.success') : 
               message.type === 'error' ? t('serialPorts.error') : 
               t('serialPorts.info')}
        message={message.text}
        type={message.type}
      />
    </div>
  )
})

SerialPorts.displayName = 'SerialPorts'

export default SerialPorts
