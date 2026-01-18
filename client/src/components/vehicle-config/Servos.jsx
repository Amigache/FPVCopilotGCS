import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotification } from '../../contexts/NotificationContext'
import { useWebSocketContext } from '../../contexts/WebSocketContext'
import useVehicleConfigSection from '../../hooks/useVehicleConfigSection'
import './common.css'
import './Servos.css'

// Servo function enums basados en la documentación de ArduPilot
// https://ardupilot.org/plane/docs/parameters.html#servon-function
const SERVO_FUNCTIONS = {
  0: 'Disabled',
  1: 'RCPassThru',
  4: 'Aileron',
  6: 'Elevator',
  19: 'RudderWithInput',
  21: 'GroundSteering',
  26: 'Rudder',
  33: 'Motor1',
  34: 'Motor2',
  35: 'Motor3',
  36: 'Motor4',
  37: 'Motor5',
  38: 'Motor6',
  39: 'Motor7',
  40: 'Motor8',
  51: 'RCIN1',
  52: 'RCIN2',
  53: 'RCIN3',
  54: 'RCIN4',
  55: 'RCIN5',
  56: 'RCIN6',
  57: 'RCIN7',
  58: 'RCIN8',
  59: 'RCIN9',
  60: 'RCIN10',
  61: 'RCIN11',
  62: 'RCIN12',
  63: 'RCIN13',
  64: 'RCIN14',
  65: 'RCIN15',
  66: 'RCIN16',
  70: 'Throttle',
  73: 'ThrottleLeft',
  74: 'ThrottleRight',
  86: 'MotorTilt',
  89: 'CameraISO',
  90: 'CameraAperture',
  91: 'CameraFocus',
  92: 'CameraShutterSpeed',
  94: 'Script1',
  95: 'Script2',
  96: 'Script3',
  97: 'Script4',
  98: 'Script5',
  99: 'Script6',
  100: 'Script7',
  101: 'Script8',
  102: 'Script9',
  103: 'Script10',
  120: 'NeoPixel1',
  121: 'NeoPixel2',
  122: 'NeoPixel3',
  123: 'NeoPixel4',
  124: 'ProfiLED1',
  125: 'ProfiLED2',
  126: 'ProfiLED3',
  129: 'ProfiLEDClock'
}

const Servos = forwardRef(({ systemId, vehicle }, ref) => {
  const { t } = useTranslation()
  const notify = useNotification()
  const { vehicles } = useWebSocketContext()
  const [servoData, setServoData] = useState({})
  const [modifiedParams, setModifiedParams] = useState({})
  const [expandedServo, setExpandedServo] = useState(null)
  const NUM_SERVOS = 16

  // Función para cargar datos desde el Map de parámetros
  const loadDataFn = useCallback(async (paramsMap) => {
    const servos = {}
    
    for (let i = 1; i <= NUM_SERVOS; i++) {
      const functionParam = paramsMap.get(`SERVO${i}_FUNCTION`)
      const minParam = paramsMap.get(`SERVO${i}_MIN`)
      const maxParam = paramsMap.get(`SERVO${i}_MAX`)
      const trimParam = paramsMap.get(`SERVO${i}_TRIM`)
      const reversedParam = paramsMap.get(`SERVO${i}_REVERSED`)
      
      servos[i] = {
        function: functionParam ? parseInt(functionParam.value) : 0,
        min: minParam ? parseInt(minParam.value) : 1100,
        max: maxParam ? parseInt(maxParam.value) : 1900,
        trim: trimParam ? parseInt(trimParam.value) : 1500,
        reversed: reversedParam ? parseInt(reversedParam.value) : 0,
        currentValue: 0 // Se actualizará desde telemetría
      }
    }
    
    setServoData(servos)
    setModifiedParams({})
    return { originalValues: servos }
  }, [NUM_SERVOS])

  // Función para obtener parámetros modificados
  const getChangedParams = useCallback(() => {
    return Object.values(modifiedParams)
  }, [modifiedParams])

  // Callback después de guardar
  const onSaveSuccess = useCallback(() => {
    setModifiedParams({})
  }, [])

  // Hook de configuración
  const configSection = useVehicleConfigSection({
    loadDataFn,
    getChangedParams,
    onSaveSuccess,
    t
  })

  // Número de salidas de servo a mostrar (típicamente 8-16)

  // Exponer métodos al componente padre
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: configSection.hasUnsavedChanges,
    saveChanges: () => configSection.saveChanges(),
    resetChanges: () => {
      setServoData({ ...configSection.originalValues })
      setModifiedParams({})
      configSection.resetChanges()
    }
  }))

  useEffect(() => {
    configSection.loadData()
  }, [])

  const handleParamChange = (servoNum, paramName, value) => {
    const fullParamName = `SERVO${servoNum}_${paramName.toUpperCase()}`
    const originalServo = configSection.originalValues[servoNum]
    const newValue = parseInt(value)
    
    // Actualizar estado local
    setServoData(prev => ({
      ...prev,
      [servoNum]: {
        ...prev[servoNum],
        [paramName]: newValue
      }
    }))

    // Verificar si es diferente del original
    const isModified = originalServo && originalServo[paramName] !== newValue
    
    if (isModified) {
      setModifiedParams(prev => ({
        ...prev,
        [fullParamName]: {
          name: fullParamName,
          value: newValue
        }
      }))
      configSection.markAsModified()
    } else {
      // Si vuelve al valor original, quitar de modificados
      setModifiedParams(prev => {
        const newModified = { ...prev }
        delete newModified[fullParamName]
        return newModified
      })
      if (Object.keys(modifiedParams).length <= 1) {
        configSection.markAsModified(false)
      }
    }
  }

  const getFunctionName = (value) => {
    const functionName = SERVO_FUNCTIONS[value]
    if (functionName) {
      return t(`servos.functions.${functionName}`, functionName)
    }
    return t('servos.functions.Unknown', `Unknown (${value})`)
  }

  const isServoModified = (servoNum) => {
    return Object.keys(modifiedParams).some(key => key.startsWith(`SERVO${servoNum}_`))
  }

  if (configSection.loading) {
    return (
      <div className="config-section">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('servos.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="config-section">
      <div className="section-header">
        <div className="header-left">
          <h3 className="section-title">{t('servos.title')}</h3>
          <p className="section-description">{t('servos.description')}</p>
        </div>
        <div className="header-right">
          <button 
            onClick={() => configSection.saveChanges()}
            disabled={Object.keys(modifiedParams).length === 0 || configSection.saving}
            className={`save-button ${Object.keys(modifiedParams).length > 0 ? 'modified' : ''}`}
          >
            {configSection.saving ? t('servos.saving') : 
             Object.keys(modifiedParams).length > 0 ? `${t('servos.saveChanges')} (${Object.keys(modifiedParams).length})` : 
             t('servos.noChanges')}
          </button>
        </div>
      </div>

      <div className="servos-list">
        {Array.from({ length: NUM_SERVOS }, (_, i) => i + 1).map(servoNum => {
          const servo = servoData[servoNum] || {}
          const isModified = isServoModified(servoNum)
          const isExpanded = expandedServo === servoNum
          const functionName = getFunctionName(servo.function)
          
          return (
            <div key={servoNum} className={`servo-card ${isModified ? 'modified' : ''}`}>
              <div 
                className="servo-header"
                onClick={() => setExpandedServo(isExpanded ? null : servoNum)}
              >
                <div className="servo-header-left">
                  <span className="servo-number">Servo {servoNum}</span>
                  <span className="servo-function">{functionName}</span>
                </div>
                <div className="servo-header-right">
                  {isModified && <span className="modified-badge">*</span>}
                  <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="servo-details">
                  <div className="servo-row">
                    <label className="servo-label">{t('servos.function')}</label>
                    <select
                      className="servo-select"
                      value={servo.function}
                      onChange={(e) => handleParamChange(servoNum, 'function', e.target.value)}
                      disabled={configSection.saving}
                    >
                      {Object.entries(SERVO_FUNCTIONS).map(([value, name]) => (
                        <option key={value} value={value}>
                          {t(`servos.functions.${name}`, name)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="servo-row">
                    <label className="servo-label">{t('servos.reversed')}</label>
                    <input
                      type="checkbox"
                      className="servo-checkbox"
                      checked={servo.reversed === 1}
                      onChange={(e) => handleParamChange(servoNum, 'reversed', e.target.checked ? 1 : 0)}
                      disabled={configSection.saving}
                    />
                    <span className="servo-unit"></span>
                  </div>

                  <div className="servo-row">
                    <label className="servo-label">{t('servos.min')}</label>
                    <input
                      type="number"
                      className="servo-input"
                      value={servo.min}
                      onChange={(e) => handleParamChange(servoNum, 'min', e.target.value)}
                      disabled={configSection.saving}
                      min="800"
                      max="2200"
                    />
                    <span className="servo-unit">μs</span>
                  </div>

                  <div className="servo-row">
                    <label className="servo-label">{t('servos.trim')}</label>
                    <input
                      type="number"
                      className="servo-input"
                      value={servo.trim}
                      onChange={(e) => handleParamChange(servoNum, 'trim', e.target.value)}
                      disabled={configSection.saving}
                      min="800"
                      max="2200"
                    />
                    <span className="servo-unit">μs</span>
                  </div>

                  <div className="servo-row">
                    <label className="servo-label">{t('servos.max')}</label>
                    <input
                      type="number"
                      className="servo-input"
                      value={servo.max}
                      onChange={(e) => handleParamChange(servoNum, 'max', e.target.value)}
                      disabled={configSection.saving}
                      min="800"
                      max="2200"
                    />
                    <span className="servo-unit">μs</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

Servos.displayName = 'Servos'

export default Servos
