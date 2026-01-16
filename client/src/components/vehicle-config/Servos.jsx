import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotification } from '../../contexts/NotificationContext'
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
  73: 'Throttle',
  74: 'ThrottleLeft',
  75: 'ThrottleRight',
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

const Servos = forwardRef(({ systemId }, ref) => {
  const { t } = useTranslation()
  const notify = useNotification()
  const [servoOutputs, setServoOutputs] = useState({})
  const [modifiedOutputs, setModifiedOutputs] = useState({})
  const NUM_OUTPUTS = 16

  // Función para cargar datos desde el Map de parámetros
  const loadDataFn = useCallback(async (paramsMap) => {
    const servoParams = {}
    for (let i = 1; i <= NUM_OUTPUTS; i++) {
      const paramName = `SERVO${i}_FUNCTION`
      const param = paramsMap.get(paramName)
      if (param && param.value !== undefined && param.value !== null) {
        servoParams[i] = parseInt(param.value)
      }
    }
    
    setServoOutputs(servoParams)
    setModifiedOutputs({})
    return { originalValues: servoParams }
  }, [NUM_OUTPUTS])

  // Función para obtener parámetros modificados
  const getChangedParams = useCallback(() => {
    const paramsToUpdate = []
    
    for (const [output, value] of Object.entries(servoOutputs)) {
      if (value !== configSection.originalValues[output]) {
        paramsToUpdate.push({
          name: `SERVO${output}_FUNCTION`,
          value: parseInt(value)
        })
      }
    }
    
    return paramsToUpdate
  }, [servoOutputs])

  // Callback después de guardar
  const onSaveSuccess = useCallback(() => {
    setModifiedOutputs({})
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
      setServoOutputs({ ...configSection.originalValues })
      configSection.resetChanges()
    }
  }))

  useEffect(() => {
    configSection.loadData()
  }, [])

  const handleServoFunctionChange = (outputNum, newValue) => {
    const newValueInt = parseInt(newValue)
    const originalValue = configSection.originalValues[outputNum] || 0
    
    // Actualizar estado local
    setServoOutputs(prev => ({
      ...prev,
      [outputNum]: newValueInt
    }))

    // Trackear si ha sido modificado
    if (newValueInt !== originalValue) {
      setModifiedOutputs(prev => ({
        ...prev,
        [outputNum]: newValueInt
      }))
      configSection.markAsModified()
    } else {
      // Si vuelve al valor original, quitar de modificados
      setModifiedOutputs(prev => {
        const newModified = { ...prev }
        delete newModified[outputNum]
        return newModified
      })
      if (Object.keys({ ...modifiedOutputs, [outputNum]: undefined }).filter(k => modifiedOutputs[k] !== undefined).length === 0) {
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
            disabled={Object.keys(modifiedOutputs).length === 0 || configSection.saving}
            className={`save-button ${Object.keys(modifiedOutputs).length > 0 ? 'modified' : ''}`}
          >
            {configSection.saving ? t('servos.saving') : 
             Object.keys(modifiedOutputs).length > 0 ? `${t('servos.saveChanges')} (${Object.keys(modifiedOutputs).length})` : 
             t('servos.noChanges')}
          </button>
        </div>
      </div>

      {configSection.loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('servos.loading')}</p>
        </div>
      ) : (
        <div className="frame-outputs-grid">
          {Array.from({ length: NUM_OUTPUTS }, (_, i) => i + 1).map(outputNum => {
            const currentValue = servoOutputs[outputNum] || 0

            const isModified = modifiedOutputs.hasOwnProperty(outputNum)
            
            return (
              <div key={outputNum} className="output-item">
                <label className="output-label">
                  {t('servos.output')} {outputNum}
                  {isModified && <span className="modified-indicator">*</span>}
                </label>
                <select
                  className={`output-select ${isModified ? 'modified' : ''}`}
                  value={currentValue}
                  onChange={(e) => handleServoFunctionChange(outputNum, e.target.value)}
                  disabled={configSection.saving}
                >
                  {Object.entries(SERVO_FUNCTIONS).map(([value, name]) => (
                    <option key={value} value={value}>
                      {t(`servos.functions.${name}`, name)}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

Servos.displayName = 'Servos'

export default Servos
