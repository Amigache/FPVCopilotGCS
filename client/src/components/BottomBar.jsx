import { useState, useEffect } from 'react'
import { useWebSocketContext } from '../contexts/WebSocketContext'
import './BottomBar.css'

function BottomBar() {
  const { vehicles, selectedVehicleId } = useWebSocketContext()
  const [zoom, setZoom] = useState(13)
  const [currentTime, setCurrentTime] = useState('')
  
  // Actualizar hora local cada segundo
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const hours = now.getHours().toString().padStart(2, '0')
      const minutes = now.getMinutes().toString().padStart(2, '0')
      setCurrentTime(`${hours}:${minutes}h`)
    }
    
    // Inicializar hora
    updateTime()
    
    // Actualizar cada segundo
    const timer = setInterval(updateTime, 1000)
    
    return () => clearInterval(timer)
  }, [])
  
  // Escuchar cambios en el zoom del mapa
  useEffect(() => {
    const updateZoom = () => {
      const savedZoom = localStorage.getItem('map_zoom')
      if (savedZoom) {
        setZoom(parseInt(savedZoom))
      }
    }
    
    // Inicializar zoom
    updateZoom()
    
    // Escuchar evento de cambio de zoom
    window.addEventListener('mapZoomChanged', updateZoom)
    
    return () => {
      window.removeEventListener('mapZoomChanged', updateZoom)
    }
  }, [])
  
  // Obtener datos del vehículo activo (seleccionado)
  const vehicleData = vehicles && selectedVehicleId
    ? vehicles.find(v => v.systemId === selectedVehicleId)
    : null

  // Formatear latitud y longitud con 7 decimales
  const formatCoordinate = (value) => {
    if (value === null || value === undefined || value === 0) return '-------'
    return value.toFixed(7)
  }

  // Obtener tipo de fix GPS
  const getGPSFixType = () => {
    if (!vehicleData) return 'No Fix'
    const fixType = vehicleData.gps_fix_type ?? vehicleData.fix_type ?? 0
    switch(fixType) {
      case 0: return 'No GPS'
      case 1: return 'No Fix'
      case 2: return '2D Fix'
      case 3: return '3D Fix'
      case 4: return 'DGPS'
      case 5: return 'RTK Float'
      case 6: return 'RTK Fixed'
      default: return 'Unknown'
    }
  }

  // Obtener número de satélites
  const getSatellites = () => {
    if (!vehicleData) return 0
    return vehicleData.gps_satellites ?? vehicleData.satellites_visible ?? 0
  }

  // Obtener HDOP
  const getHDOP = () => {
    if (!vehicleData) return '---'
    const hdop = vehicleData.gps_hdop ?? 0
    if (hdop === 0 || hdop === null || hdop === undefined) return '---'
    return hdop.toFixed(2)
  }

  const latitude = vehicleData?.lat || 0
  const longitude = vehicleData?.lon || 0

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-content">
        <span className="bottom-bar-item">Zoom: {zoom}</span>
        <span className="bottom-bar-separator">|</span>
        <span className="bottom-bar-item">Lat: {formatCoordinate(latitude)}</span>
        <span className="bottom-bar-separator">|</span>
        <span className="bottom-bar-item">Long: {formatCoordinate(longitude)}</span>
        <span className="bottom-bar-separator">|</span>
        <span className="bottom-bar-item">GPS: {getGPSFixType()}</span>
        <span className="bottom-bar-separator">|</span>
        <span className="bottom-bar-item">Sats: {getSatellites()}</span>
        <span className="bottom-bar-separator">|</span>
        <span className="bottom-bar-item">HDOP: {getHDOP()}</span>
      </div>
      <div className="bottom-bar-time">
        Local Time: {currentTime}
      </div>
    </div>
  )
}

export default BottomBar
