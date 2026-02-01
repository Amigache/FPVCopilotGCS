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
  const [containerReady, setContainerReady] = useState(false)
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

  useEffect(() => {
    // Asegurar que el contenedor esté listo cuando se muestra la pantalla de calibración
    if (step === 1 && containerRef.current) {
      setContainerReady(true)
    }
  }, [step])

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
    console.log('🚀 Starting calibration...')
    console.log(`   Selected device: ${selectedDevice.name} (ID: ${selectedDevice.id})`)
    console.log(`   Target points: ${targetPoints.length}`)
    setStep(1)
    setCalibrationPoints([])
    setCurrentPoint(0)
  }

  const handleTouchPoint = (event) => {
    if (step !== 1) return

    event.preventDefault()
    event.stopPropagation()

    const rect = containerRef.current.getBoundingClientRect()
    
    // Obtener coordenadas del toque
    let touchX, touchY
    if (event.type === 'touchstart' && event.touches && event.touches[0]) {
      touchX = event.touches[0].clientX
      touchY = event.touches[0].clientY
    } else {
      touchX = event.clientX
      touchY = event.clientY
    }

    // Normalizar a [0, 1]
    const normalizedX = touchX / rect.width
    const normalizedY = touchY / rect.height

    console.log(`📍 Point ${currentPoint + 1}/${targetPoints.length}:`)
    console.log(`   Target: (${targetPoints[currentPoint].x}, ${targetPoints[currentPoint].y})`)
    console.log(`   Touch: (${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)})`)

    const newPoints = [...calibrationPoints, {
      target: targetPoints[currentPoint],
      actual: { x: normalizedX, y: normalizedY }
    }]

    setCalibrationPoints(newPoints)

    if (currentPoint < targetPoints.length - 1) {
      console.log(`➡️  Moving to next point: ${currentPoint + 1} → ${currentPoint + 2}`)
      setCurrentPoint(currentPoint + 1)
    } else {
      // Calibración completa
      console.log('✅ All calibration points collected')
      calculateMatrix(newPoints)
    }
  }

  const calculateMatrix = async (points) => {
    setStep(2)
    setProcessing(true)

    try {
      console.log('🧮 Calculating transformation matrix...')
      console.log('Calibration points:', points)

      // Usar método más simple: calcular escalas y offsets promedio
      let totalScaleX = 0, totalScaleY = 0
      let totalOffsetX = 0, totalOffsetY = 0
      const count = points.length

      // Calcular la transformación necesaria para cada punto
      for (let i = 0; i < count; i++) {
        const point = points[i]
        
        // dx = target_x - actual_x
        // dy = target_y - actual_y
        const dx = point.target.x - point.actual.x
        const dy = point.target.y - point.actual.y
        
        totalOffsetX += dx
        totalOffsetY += dy
        
        // Calcular escalas basadas en la diferencia con el centro
        if (point.actual.x !== 0.5) {
          const scaleX = (point.target.x - 0.5) / (point.actual.x - 0.5)
          totalScaleX += scaleX
        }
        if (point.actual.y !== 0.5) {
          const scaleY = (point.target.y - 0.5) / (point.actual.y - 0.5)
          totalScaleY += scaleY
        }
      }

      // Promediar
      const avgOffsetX = totalOffsetX / count
      const avgOffsetY = totalOffsetY / count
      
      // Contar cuántos puntos contribuyeron a las escalas
      const scaleCountX = points.filter(p => p.actual.x !== 0.5).length
      const scaleCountY = points.filter(p => p.actual.y !== 0.5).length
      
      const scaleX = scaleCountX > 0 ? totalScaleX / scaleCountX : 1
      const scaleY = scaleCountY > 0 ? totalScaleY / scaleCountY : 1

      console.log('Calculated values:')
      console.log(`  Scale: (${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`)
      console.log(`  Offset: (${avgOffsetX.toFixed(3)}, ${avgOffsetY.toFixed(3)})`)

      // Construir matriz de transformación
      // x' = scaleX * x + offsetX
      // y' = scaleY * y + offsetY
      const matrix = [
        scaleX, 0, avgOffsetX,
        0, scaleY, avgOffsetY,
        0, 0, 1
      ]

      console.log('Transformation matrix:', matrix.map(n => n.toFixed(3)).join(', '))

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
    if (currentPoint >= targetPoints.length) {
      console.log('⚠️ currentPoint >= targetPoints.length, not rendering')
      return null
    }

    const point = targetPoints[currentPoint]
    console.log(`🎯 Rendering calibration point ${currentPoint + 1}/${targetPoints.length}:`, point)
    console.log(`   Position: ${point.x * 100}% x ${point.y * 100}%`)
    console.log(`   containerReady: ${containerReady}`)
    
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

        {containerReady && (
          <div 
            className="calibration-target"
            style={{
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`
            }}
          >
            <div className="target-ring"></div>
            <div className="target-ring"></div>
            <div className="target-center"></div>
          </div>
        )}

        {/* DEBUG: Mostrar puntos anteriores tocados */}
        {calibrationPoints.map((cp, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${cp.actual.x * 100}%`,
              top: `${cp.actual.y * 100}%`,
              width: '10px',
              height: '10px',
              background: 'rgba(255, 0, 0, 0.5)',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none'
            }}
          />
        ))}

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
