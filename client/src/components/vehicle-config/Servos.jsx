import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
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
  const [servoOutputs, setServoOutputs] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [modifiedOutputs, setModifiedOutputs] = useState({})
  const [originalValues, setOriginalValues] = useState({})
  // Número de salidas de servo a mostrar (típicamente 8-16)
  const NUM_OUTPUTS = 16

  // Exponer métodos al componente padre
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => Object.keys(modifiedOutputs).length > 0,
    saveChanges: handleSaveModified,
    resetChanges: () => {
      setServoOutputs({ ...originalValues })
      setModifiedOutputs({})
      setMessage({ text: '', type: '' })
    }
  }))

  useEffect(() => {
    loadServoFunctions()
  }, [])

  const loadServoFunctions = async () => {
    try {
      // Verificar estado de conexión
      const statusResponse = await fetch('/api/mavlink/parameters/status')
      const statusData = await statusResponse.json()
      setIsConnected(statusData.connected || false)

      if (!statusData.connected) {
        setServoOutputs({})
        return
      }

      setLoading(true)
      
      // Cargar parámetros SERVO*_FUNCTION
      const response = await fetch('/api/mavlink/parameters')
      const data = await response.json()
      
      if (data.parameters) {
        const servoParams = {}
        data.parameters.forEach(param => {
          // Buscar parámetros SERVO*_FUNCTION
          const match = param.name.match(/^SERVO(\d+)_FUNCTION$/)
          if (match) {
            const outputNum = parseInt(match[1])
            servoParams[outputNum] = parseInt(param.value)
          }
        })
        setServoOutputs(servoParams)
        setOriginalValues(servoParams)
        setModifiedOutputs({})
      }
    } catch (error) {
      console.error('Error loading servo functions:', error)
      showMessage(t('servos.errorLoading'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleServoFunctionChange = (outputNum, newValue) => {
    const newValueInt = parseInt(newValue)
    const originalValue = originalValues[outputNum] || 0
    
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
    } else {
      // Si vuelve al valor original, quitar de modificados
      setModifiedOutputs(prev => {
        const newModified = { ...prev }
        delete newModified[outputNum]
        return newModified
      })
    }
  }

  const handleSaveModified = async () => {
    if (Object.keys(modifiedOutputs).length === 0) {
      showMessage(t('servos.noChanges'), 'info')
      return
    }

    try {
      setSaving(true)
      const errors = []
      
      for (const [outputNum, value] of Object.entries(modifiedOutputs)) {
        const paramName = `SERVO${outputNum}_FUNCTION`
        
        try {
          const response = await fetch('/api/mavlink/parameters/set', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              name: paramName,
              value: parseInt(value) 
            }),
          })

          const result = await response.json()
          
          if (!response.ok || !result.success) {
            console.error(`Failed to save ${paramName}:`, result)
            errors.push(paramName)
          }
        } catch (error) {
          console.error(`Error saving ${paramName}:`, error)
          errors.push(paramName)
        }
      }

      if (errors.length === 0) {
        showMessage(t('servos.successSaveAll', { count: Object.keys(modifiedOutputs).length }), 'success')
        setOriginalValues({ ...servoOutputs })
        setModifiedOutputs({})
        // Recargar parámetros para mantener sincronización con otras secciones
        setTimeout(() => loadServoFunctions(), 500)
      } else {
        showMessage(t('servos.errorSavePartial', { errors: errors.join(', ') }), 'error')
      }
    } catch (error) {
      console.error('Error updating servo functions:', error)
      showMessage(t('servos.errorSave'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const showMessage = (text, type) => {
    setMessage({ text, type })
    setTimeout(() => setMessage({ text: '', type: '' }), 5000)
  }

  const getFunctionName = (value) => {
    const functionName = SERVO_FUNCTIONS[value]
    if (functionName) {
      return t(`servos.functions.${functionName}`, functionName)
    }
    return t('servos.functions.Unknown', `Unknown (${value})`)
  }

  if (!isConnected) {
    return (
      <div className="config-section">
        <div className="empty-state">
          <div className="empty-icon">🔌</div>
          <h3>{t('servos.noConnection')}</h3>
          <p>{t('servos.noConnectionHint')}</p>
        </div>
      </div>
    )
  }

  if (loading) {
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
            onClick={handleSaveModified}
            disabled={Object.keys(modifiedOutputs).length === 0 || saving}
            className={`save-button ${Object.keys(modifiedOutputs).length > 0 ? 'modified' : ''}`}
          >
            {saving ? t('servos.saving') : 
             Object.keys(modifiedOutputs).length > 0 ? `${t('servos.saveChanges')} (${Object.keys(modifiedOutputs).length})` : 
             t('servos.noChanges')}
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      {loading ? (
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
                  disabled={saving}
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
