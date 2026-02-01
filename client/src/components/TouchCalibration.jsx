import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './TouchCalibration.css'

function TouchCalibration({ onClose, onComplete }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [calibrationPoints, setCalibrationPoints] = useState([])
  const [currentPoint, setCurrentPoint] = useState(0)
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [processing, setProcessing] = useState(false)
  const containerRef = useRef(null)

  // Definir puntos de calibración (porcentajes de la pantalla)
  const targetPoints = [
    { x: 0.1, y: 0.1, name: 'Top Left' },
    { x: 0.9, y: 0.1, name: 'Top Right' },
    { x: 0.9, y: 0.9, name: 'Bottom Right' },
    { x: 0.1, y: 0.9, name: 'Bottom Left' },
    { x: 0.5, y: 0.5, name: 'Center' }
  ]

  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/system/touch/devices')
      const data = await response.json()
      setDevices(data.devices || [])
      if (data.devices && data.devices.length > 0) {
        setSelectedDevice(data.devices[0])
      }
    } catch (error) {
      console.error('Error fetching touch devices:', error)
    }
  }

  const handleStartCalibration = () => {
    if (!selectedDevice) {
      alert(t('touchCalibration.noDeviceSelected'))
      return
    }
    setStep(1)
    setCalibrationPoints([])
    setCurrentPoint(0)
  }

  const handleTouchPoint = (event) => {
    if (step !== 1) return

    const rect = containerRef.current.getBoundingClientRect()
    const touchX = (event.clientX || event.touches?.[0]?.clientX) - rect.left
    const touchY = (event.clientY || event.touches?.[0]?.clientY) - rect.top

    const normalizedX = touchX / rect.width
    const normalizedY = touchY / rect.height

    const newPoints = [...calibrationPoints, {
      target: targetPoints[currentPoint],
      actual: { x: normalizedX, y: normalizedY }
    }]

    setCalibrationPoints(newPoints)

    if (currentPoint < targetPoints.length - 1) {
      setCurrentPoint(currentPoint + 1)
    } else {
      // Calibración completa
      calculateMatrix(newPoints)
    }
  }

  const calculateMatrix = async (points) => {
    setStep(2)
    setProcessing(true)

    try {
      // Calcular matriz de transformación usando mínimos cuadrados
      // Formato de matriz: [a b c d e f g h i]
      // x' = ax + by + c
      // y' = dx + ey + f
      // w' = gx + hy + i (normalmente [0 0 1])

      let sumX = 0, sumY = 0, sumXx = 0, sumXy = 0, sumYx = 0, sumYy = 0
      let sumTargetX = 0, sumTargetY = 0
      let count = points.length

      points.forEach(point => {
        const actual = point.actual
        const target = point.target

        sumX += actual.x
        sumY += actual.y
        sumXx += actual.x * actual.x
        sumXy += actual.x * actual.y
        sumYx += actual.y * actual.x
        sumYy += actual.y * actual.y
        sumTargetX += target.x
        sumTargetY += target.y
      })

      // Calcular diferencias promedio
      const avgActualX = sumX / count
      const avgActualY = sumY / count
      const avgTargetX = sumTargetX / count
      const avgTargetY = sumTargetY / count

      let scaleX = 0, scaleY = 0, skewX = 0, skewY = 0

      points.forEach(point => {
        const dx = point.actual.x - avgActualX
        const dy = point.actual.y - avgActualY
        const dtx = point.target.x - avgTargetX
        const dty = point.target.y - avgTargetY

        scaleX += dtx * dx
        skewX += dtx * dy
        skewY += dty * dx
        scaleY += dty * dy
      })

      const variance = points.reduce((sum, point) => {
        const dx = point.actual.x - avgActualX
        const dy = point.actual.y - avgActualY
        return sum + dx * dx + dy * dy
      }, 0)

      if (variance !== 0) {
        scaleX /= variance
        scaleY /= variance
        skewX /= variance
        skewY /= variance
      } else {
        scaleX = scaleY = 1
        skewX = skewY = 0
      }

      // Calcular offset
      const offsetX = avgTargetX - (scaleX * avgActualX + skewX * avgActualY)
      const offsetY = avgTargetY - (skewY * avgActualX + scaleY * avgActualY)

      // Construir matriz de transformación
      const matrix = [
        scaleX, skewX, offsetX,
        skewY, scaleY, offsetY,
        0, 0, 1
      ]

      // Aplicar calibración
      const response = await fetch('http://localhost:3000/api/system/touch/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          matrix
        })
      })

      const result = await response.json()

      if (result.success) {
        // Guardar en .xinitrc
        await saveCalibration(matrix)
      } else {
        throw new Error(result.error || 'Error applying calibration')
      }

    } catch (error) {
      console.error('Error calculating matrix:', error)
      alert(t('touchCalibration.calibrationError') + ': ' + error.message)
      setStep(0)
    } finally {
      setProcessing(false)
    }
  }

  const saveCalibration = async (matrix) => {
    try {
      const response = await fetch('http://localhost:3000/api/system/touch/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          deviceName: selectedDevice.name,
          matrix,
          disableId: null, // El usuario puede configurar esto si es necesario
          reattachId: null,
          masterId: null
        })
      })

      const result = await response.json()

      if (result.success) {
        setStep(3)
        setTimeout(() => {
          if (onComplete) onComplete(matrix)
        }, 2000)
      } else {
        throw new Error(result.error || 'Error saving calibration')
      }
    } catch (error) {
      console.error('Error saving calibration:', error)
      alert(t('touchCalibration.saveError') + ': ' + error.message)
    }
  }

  const renderDeviceSelection = () => (
    <div className="calibration-step">
      <h2>{t('touchCalibration.selectDevice')}</h2>
      <p className="step-description">{t('touchCalibration.selectDeviceDescription')}</p>
      
      {devices.length === 0 ? (
        <div className="no-devices">
          <p>{t('touchCalibration.noDevices')}</p>
        </div>
      ) : (
        <div className="device-list">
          {devices.map((device) => (
            <div 
              key={device.id}
              className={`device-option ${selectedDevice?.id === device.id ? 'selected' : ''}`}
              onClick={() => setSelectedDevice(device)}
            >
              <div className="device-info">
                <span className="device-name">📱 {device.name}</span>
                <span className="device-id">ID: {device.id}</span>
              </div>
              {device.matrix && (
                <div className="device-matrix">
                  <small>{t('touchCalibration.currentMatrix')}:</small>
                  <code>{device.matrix.slice(0, 3).map(n => n.toFixed(2)).join(', ')}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="calibration-actions">
        <button className="btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button 
          className="btn-primary" 
          onClick={handleStartCalibration}
          disabled={!selectedDevice}
        >
          {t('touchCalibration.startCalibration')}
        </button>
      </div>
    </div>
  )

  const renderCalibrationScreen = () => {
    const point = targetPoints[currentPoint]
    const rect = containerRef.current?.getBoundingClientRect()
    
    if (!rect) return null

    const pixelX = point.x * rect.width
    const pixelY = point.y * rect.height

    return (
      <div 
        className="calibration-fullscreen"
        ref={containerRef}
        onClick={handleTouchPoint}
        onTouchStart={handleTouchPoint}
      >
        <div className="calibration-instruction">
          <h2>{t('touchCalibration.tapTarget')}</h2>
          <p>{t('touchCalibration.point')} {currentPoint + 1} / {targetPoints.length}</p>
        </div>

        <div 
          className="calibration-target"
          style={{
            left: `${pixelX}px`,
            top: `${pixelY}px`
          }}
        >
          <div className="target-ring"></div>
          <div className="target-ring"></div>
          <div className="target-center"></div>
        </div>

        <button className="btn-cancel-calibration" onClick={() => setStep(0)}>
          ✕ {t('common.cancel')}
        </button>
      </div>
    )
  }

  const renderProcessing = () => (
    <div className="calibration-step">
      <div className="processing-container">
        <div className="spinner"></div>
        <h2>{t('touchCalibration.processing')}</h2>
        <p>{t('touchCalibration.processingDescription')}</p>
      </div>
    </div>
  )

  const renderComplete = () => (
    <div className="calibration-step">
      <div className="complete-container">
        <div className="success-icon">✓</div>
        <h2>{t('touchCalibration.complete')}</h2>
        <p>{t('touchCalibration.completeDescription')}</p>
        <button className="btn-primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="touch-calibration-overlay">
      {step === 0 && renderDeviceSelection()}
      {step === 1 && renderCalibrationScreen()}
      {step === 2 && renderProcessing()}
      {step === 3 && renderComplete()}
    </div>
  )
}

export default TouchCalibration
