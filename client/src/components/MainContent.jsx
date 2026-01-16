import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'
import './MainContent.css'
import L from 'leaflet'
import Modal from './Modal'

// Fix para los iconos de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Icono para el marcador del menú contextual
const contextMarkerIcon = L.divIcon({
  className: 'context-marker',
  html: `
    <div style="
      width: 24px;
      height: 24px;
      background-color: rgba(255, 87, 34, 0.8);
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
})

// Iconos personalizados para vehículos
const createVehicleIcon = (systemId, connected, heading = 0) => {
  const color = connected ? '#4caf50' : '#f44336'
  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div style="
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(${heading}deg);
      ">
        <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.5"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path d="M 25 5 L 38 38 L 25 32 L 12 38 Z" 
                fill="${color}" 
                stroke="white" 
                stroke-width="2.5" 
                filter="url(#shadow)"/>
          <circle cx="25" cy="25" r="5" fill="white" opacity="0.9"/>
          <text x="25" y="27" text-anchor="middle" 
                font-size="12" font-weight="bold" 
                fill="#000" opacity="0.8">${systemId}</text>
        </svg>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  })
}

// Componente para centrar el mapa en los vehículos
function MapController({ vehicles, followVehicle }) {
  const map = useMap()
  
  useEffect(() => {
    if (vehicles.length > 0 && followVehicle) {
      const bounds = vehicles.map(v => [v.lat, v.lon])
      if (bounds.length === 1) {
        map.setView(bounds[0], map.getZoom(), { animate: true })
      } else {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [vehicles, followVehicle, map])
  
  return null
}

// Componente para manejar eventos del mapa
function MapEventHandler({ onContextMenu }) {
  const map = useMap()
  
  useEffect(() => {
    const handleContextMenu = (e) => {
      e.originalEvent.preventDefault() // Prevenir menú contextual del navegador
      e.originalEvent.stopPropagation() // Detener propagación del evento
      onContextMenu(e.latlng, e.containerPoint)
    }
    
    map.on('contextmenu', handleContextMenu)
    
    return () => {
      map.off('contextmenu', handleContextMenu)
    }
  }, [map, onContextMenu])
  
  return null
}

function MainContent({ onVehicleConfigClick, onArmDisarmRequest }) {
  const { t } = useTranslation()
  const [vehicles, setVehicles] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [expandedCard, setExpandedCard] = useState('info') // 'info' o 'actions'
  const [resultModal, setResultModal] = useState({ isOpen: false, title: '', message: '', type: 'info' })
  const [actionLoading, setActionLoading] = useState(false)
  const [mapLayer, setMapLayer] = useState('street') // 'street' o 'satellite'
  const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, coords: null })
  const [availableFlightModes, setAvailableFlightModes] = useState({})
  const [followVehicle, setFollowVehicle] = useState(true) // Seguimiento automático del vehículo
  // SITL Ardupilot por defecto: Canberra, Australia
  const defaultPosition = [-35.363261, 149.165230]

  useEffect(() => {
    // Cargar vehículos inicialmente
    loadVehicles()
    
    // Actualizar cada segundo
    const interval = setInterval(loadVehicles, 1000)
    
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Cargar mensajes inicialmente
    loadMessages()
    
    // Actualizar cada 2 segundos
    const interval = setInterval(loadMessages, 2000)
    
    return () => clearInterval(interval)
  }, [selectedVehicle])

  // Auto-seleccionar vehículo cuando cambia la lista
  useEffect(() => {
    const connectedVehicles = vehicles.filter(v => v.connected)
    
    // Auto-seleccionar el primer vehículo si no hay ninguno seleccionado
    if (connectedVehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(connectedVehicles[0].systemId)
    }
    
    // Si el vehículo seleccionado ya no existe, seleccionar el primero disponible
    if (selectedVehicle && !connectedVehicles.find(v => v.systemId === selectedVehicle)) {
      setSelectedVehicle(connectedVehicles.length > 0 ? connectedVehicles[0].systemId : null)
    }
    
    // Actualizar modos de vuelo disponibles según el tipo de vehículo
    if (selectedVehicle && connectedVehicles.length > 0) {
      const vehicle = connectedVehicles.find(v => v.systemId === selectedVehicle)
      if (vehicle) {
        setAvailableFlightModes(getFlightModesForVehicleType(vehicle.type))
      }
    }
  }, [vehicles, selectedVehicle])

  const getFlightModesForVehicleType = (vehicleType) => {
    // Plane modes
    if (vehicleType === 1) {
      return {
        0: 'Manual', 1: 'Circle', 2: 'Stabilize', 3: 'Training', 4: 'Acro',
        5: 'FlyByWireA', 6: 'FlyByWireB', 7: 'Cruise', 8: 'Autotune',
        10: 'Auto', 11: 'RTL', 12: 'Loiter', 13: 'Takeoff', 14: 'Avoid_ADSB',
        15: 'Guided', 17: 'QStabilize', 18: 'QHover', 19: 'QLoiter',
        20: 'QLand', 21: 'QRTL', 22: 'QAutotune', 23: 'QAcro', 24: 'Thermal'
      }
    }
    // Copter modes
    if ([2, 3, 4, 13, 14, 15].includes(vehicleType)) {
      return {
        0: 'Stabilize', 1: 'Acro', 2: 'AltHold', 3: 'Auto', 4: 'Guided',
        5: 'Loiter', 6: 'RTL', 7: 'Circle', 8: 'Position', 9: 'Land',
        10: 'OF_Loiter', 11: 'Drift', 13: 'Sport', 14: 'Flip',
        15: 'AutoTune', 16: 'PosHold', 17: 'Brake', 18: 'Throw',
        19: 'Avoid_ADSB', 20: 'Guided_NoGPS', 21: 'Smart_RTL',
        22: 'FlowHold', 23: 'Follow', 24: 'ZigZag', 25: 'SystemID',
        26: 'Heli_Autorotate', 27: 'Auto_RTL'
      }
    }
    // Rover modes
    if (vehicleType === 10) {
      return {
        0: 'Manual', 1: 'Acro', 2: 'Learning', 3: 'Steering', 4: 'Hold',
        5: 'Loiter', 6: 'Follow', 7: 'Simple', 10: 'Auto', 11: 'RTL',
        12: 'SmartRTL', 15: 'Guided'
      }
    }
    return {}
  }

  const loadVehicles = async () => {
    try {
      const response = await fetch('/api/mavlink/vehicles')
      const data = await response.json()
      // Filtrar solo vehículos conectados
      const connectedVehicles = data.filter(v => v.connected)
      setVehicles(connectedVehicles)
    } catch (error) {
      console.error('Error cargando vehículos:', error)
    }
  }

  const loadMessages = async () => {
    try {
      const url = selectedVehicle 
        ? `/api/mavlink/messages?systemId=${selectedVehicle}&limit=100`
        : '/api/mavlink/messages?limit=100'
      const response = await fetch(url)
      const data = await response.json()
      setMessages(data)
    } catch (error) {
      console.error('Error cargando mensajes:', error)
    }
  }

  const clearMessages = async () => {
    try {
      const url = selectedVehicle 
        ? `/api/mavlink/messages?systemId=${selectedVehicle}`
        : '/api/mavlink/messages'
      await fetch(url, { method: 'DELETE' })
      setMessages([])
    } catch (error) {
      console.error('Error limpiando mensajes:', error)
    }
  }

  const handleMapContextMenu = (latlng, point) => {
    // Ajustar offset si el sidebar izquierdo está abierto
    const offsetX = leftSidebarOpen ? 350 : 0
    
    // Si ya hay un menú abierto, primero lo cerramos
    if (contextMenu.show) {
      setContextMenu({ show: false, x: 0, y: 0, lat: 0, lng: 0 })
      // Usar setTimeout para asegurar que el estado se actualice antes de abrir el nuevo
      setTimeout(() => {
        setContextMenu({
          show: true,
          x: point.x + offsetX + 15, // Offset a la derecha del punto + sidebar
          y: point.y + 85, // Offset abajo del punto
          lat: latlng.lat,
          lng: latlng.lng
        })
      }, 0)
    } else {
      setContextMenu({
        show: true,
        x: point.x + offsetX + 15, // Offset a la derecha del punto + sidebar
        y: point.y + 85, // Offset abajo del punto
        lat: latlng.lat,
        lng: latlng.lng
      })
    }
  }

  const closeContextMenu = () => {
    setContextMenu({ show: false, x: 0, y: 0, lat: 0, lng: 0 })
  }

  const handleCenterHere = () => {
    // Implementar centrado del mapa
    console.log('Centrar en:', contextMenu.lat, contextMenu.lng)
    closeContextMenu()
  }

  const handleAddWaypoint = () => {
    // Implementar añadir waypoint
    console.log('Añadir waypoint en:', contextMenu.lat, contextMenu.lng)
    closeContextMenu()
  }

  const handleCopyCoordinates = () => {
    const coords = `${contextMenu.lat.toFixed(6)}, ${contextMenu.lng.toFixed(6)}`
    navigator.clipboard.writeText(coords)
    closeContextMenu()
  }

  // Funciones de control del vehículo
  const handleArmClick = () => {
    if (onArmDisarmRequest && selectedVehicle) {
      onArmDisarmRequest('arm', selectedVehicle)
    }
  }

  const handleDisarmClick = () => {
    if (onArmDisarmRequest && selectedVehicle) {
      onArmDisarmRequest('disarm', selectedVehicle)
    }
  }

  const handleFlightModeChange = async (customMode) => {
    if (!selectedVehicle || actionLoading) return
    
    setActionLoading(true)
    try {
      const response = await fetch('/api/mavlink/flightmode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          systemId: selectedVehicle,
          customMode: parseInt(customMode)
        })
      })
      
      const result = await response.json()
      setActionLoading(false)
      
      if (result.success) {
        setResultModal({
          isOpen: true,
          title: t('sidebar.actions.flightModeSuccess'),
          message: result.message || t('sidebar.actions.flightModeSuccessMessage'),
          type: 'success'
        })
      } else {
        setResultModal({
          isOpen: true,
          title: t('sidebar.actions.flightModeError'),
          message: result.message || t('sidebar.actions.flightModeErrorMessage'),
          type: 'error'
        })
      }
    } catch (error) {
      setActionLoading(false)
      setResultModal({
        isOpen: true,
        title: t('sidebar.actions.connectionError'),
        message: t('sidebar.actions.connectionErrorMessage'),
        type: 'error'
      })
    }
  }

  const getMessageIcon = (type) => {
    const icons = {
      critical: '🔴',
      error: '❌',
      warning: '⚠️',
      notice: '📢',
      info: 'ℹ️'
    }
    return icons[type] || 'ℹ️'
  }

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000) // diferencia en segundos
    
    if (diff < 60) return t('sidebar.justNow')
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="main-content">
      {/* Sidebar izquierdo */}
      <div className={`map-sidebar-left ${leftSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <h3>{t('sidebar.messages')}</h3>
            <button 
              className="clear-messages-btn"
              onClick={clearMessages}
              title={t('sidebar.clearMessages')}
            >
              🗑️
            </button>
          </div>
          <div className="sidebar-body messages-container">
            {messages.length === 0 ? (
              <div className="no-messages">
                <div className="no-messages-icon">📭</div>
                <p>{t('sidebar.noMessages')}</p>
                <p className="no-messages-hint">{t('sidebar.noMessagesHint')}</p>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((msg, index) => (
                  <div key={index} className={`message-item message-${msg.type}`}>
                    <div className="message-header">
                      <span className="message-icon">{getMessageIcon(msg.type)}</span>
                      <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
                      <span className="message-system">#{msg.systemId}</span>
                    </div>
                    <div className="message-text">{msg.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botón toggle del sidebar izquierdo */}
      <button 
        className={`sidebar-toggle-left ${leftSidebarOpen ? 'open' : 'closed'}`}
        onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
        title={leftSidebarOpen ? 'Cerrar panel izquierdo' : 'Abrir panel izquierdo'}
      >
        {leftSidebarOpen ? '‹' : '›'}
      </button>

      {/* Sidebar derecho colapsable */}
      <div className={`map-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <h3>{t('sidebar.activeVehicle')}</h3>
          </div>
          <div className="sidebar-body">
            {vehicles.length === 0 ? (
              <div className="no-vehicles">
                <div className="no-vehicles-icon">🚁</div>
                <p>{t('sidebar.noVehicles')}</p>
                <p className="no-vehicles-hint">{t('sidebar.noVehiclesHint')}</p>
              </div>
            ) : (
              <>
                <div className="vehicle-selector">
                  <label className="selector-label">{t('sidebar.selectVehicle')}:</label>
                  <select 
                    className="vehicle-dropdown"
                    value={selectedVehicle || ''}
                    onChange={(e) => setSelectedVehicle(parseInt(e.target.value))}
                  >
                    {vehicles.map(vehicle => (
                      <option key={vehicle.systemId} value={vehicle.systemId}>
                        {t('sidebar.vehicle')} #{vehicle.systemId}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedVehicle && vehicles.find(v => v.systemId === selectedVehicle) && (
                  <div className="accordion-cards">
                    {/* Card de Información */}
                    <div className={`accordion-card ${expandedCard === 'info' ? 'expanded' : 'collapsed'}`}>
                      <div 
                        className="accordion-header"
                        onClick={() => setExpandedCard(expandedCard === 'info' ? null : 'info')}
                      >
                        <div className="accordion-title">
                          <span className="accordion-icon">ℹ️</span>
                          <h4>{t('sidebar.vehicleInfo')}</h4>
                        </div>
                        <span className="accordion-arrow">{expandedCard === 'info' ? '▼' : '▶'}</span>
                      </div>
                      {expandedCard === 'info' && (
                        <div className="accordion-body">
                          {(() => {
                            const vehicle = vehicles.find(v => v.systemId === selectedVehicle)
                            return (
                              <>
                                <div className="info-grid">
                                  <div className="info-item">
                                    <span className="info-label">System ID:</span>
                                    <span className="info-value">#{vehicle.systemId}</span>
                                  </div>
                                  {vehicle.lat && vehicle.lon && (
                                    <div className="info-item full-width">
                                      <span className="info-label">{t('sidebar.position')}:</span>
                                      <span className="info-value">{vehicle.lat.toFixed(6)}, {vehicle.lon.toFixed(6)}</span>
                                    </div>
                                  )}
                                  {vehicle.alt !== undefined && (
                                    <div className="info-item">
                                      <span className="info-label">{t('sidebar.altitude')}:</span>
                                      <span className="info-value">{vehicle.alt.toFixed(1)} m</span>
                                    </div>
                                  )}
                                  {vehicle.battery_remaining !== undefined && (
                                    <div className="info-item">
                                      <span className="info-label">{t('sidebar.battery')}:</span>
                                      <span className="info-value">{vehicle.battery_remaining.toFixed(0)}%</span>
                                    </div>
                                  )}
                                  {vehicle.gps_satellites !== undefined && (
                                    <div className="info-item">
                                      <span className="info-label">{t('sidebar.gpsSatellites')}:</span>
                                      <span className="info-value">{vehicle.gps_satellites}</span>
                                    </div>
                                  )}
                                  {vehicle.groundspeed !== undefined && (
                                    <div className="info-item">
                                      <span className="info-label">{t('sidebar.speed')}:</span>
                                      <span className="info-value">{vehicle.groundspeed.toFixed(1)} m/s</span>
                                    </div>
                                  )}
                                  {vehicle.heading !== undefined && (
                                    <div className="info-item">
                                      <span className="info-label">{t('sidebar.heading')}:</span>
                                      <span className="info-value">{vehicle.heading.toFixed(0)}°</span>
                                    </div>
                                  )}
                                </div>
                                <button 
                                  className="configure-vehicle-btn"
                                  onClick={() => onVehicleConfigClick(vehicle.systemId)}
                                >
                                  <span className="btn-icon">⚙️</span>
                                  <span className="btn-text">{t('sidebar.configureVehicle')}</span>
                                </button>
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Card de Acciones */}
                    <div className={`accordion-card ${expandedCard === 'actions' ? 'expanded' : 'collapsed'}`}>
                      <div 
                        className="accordion-header"
                        onClick={() => setExpandedCard(expandedCard === 'actions' ? null : 'actions')}
                      >
                        <div className="accordion-title">
                          <span className="accordion-icon">⚡</span>
                          <h4>{t('sidebar.vehicleActions')}</h4>
                        </div>
                        <span className="accordion-arrow">{expandedCard === 'actions' ? '▼' : '▶'}</span>
                      </div>
                      {expandedCard === 'actions' && (
                        <div className="accordion-body">
                          {/* Flight Mode Selector */}
                          {(() => {
                            const vehicle = vehicles.find(v => v.systemId === selectedVehicle)
                            return (
                              <div className="flight-mode-selector">
                                <label className="flight-mode-label">
                                  <span className="label-icon">✈️</span>
                                  <span>{t('sidebar.flightMode')}</span>
                                </label>
                                <select
                                  className="flight-mode-select"
                                  value={vehicle?.custom_mode || 0}
                                  onChange={(e) => handleFlightModeChange(e.target.value)}
                                  disabled={actionLoading}
                                >
                                  {Object.entries(availableFlightModes).map(([value, name]) => (
                                    <option key={value} value={value}>
                                      {t(`flightModes.modes.${name}`, name)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )
                          })()}
                          
                          <div className="actions-grid">
                            {(() => {
                              const vehicle = vehicles.find(v => v.systemId === selectedVehicle)
                              const isArmed = vehicle ? !!(vehicle.base_mode & 128) : false
                              
                              return (
                                <>
                                  <button 
                                    className="action-button arm" 
                                    onClick={handleArmClick}
                                    disabled={isArmed}
                                  >
                                    <span className="action-icon">🔓</span>
                                    <span className="action-text">{t('sidebar.actions.arm')}</span>
                                  </button>
                                  <button 
                                    className="action-button disarm" 
                                    onClick={handleDisarmClick}
                                    disabled={!isArmed}
                                  >
                                    <span className="action-icon">🔒</span>
                                    <span className="action-text">{t('sidebar.actions.disarm')}</span>
                                  </button>
                                </>
                              )
                            })()}
                            <button className="action-button takeoff">
                              <span className="action-icon">🛫</span>
                              <span className="action-text">{t('sidebar.actions.takeoff')}</span>
                            </button>
                            <button className="action-button land">
                              <span className="action-icon">🛬</span>
                              <span className="action-text">{t('sidebar.actions.land')}</span>
                            </button>
                            <button className="action-button rtl">
                              <span className="action-icon">🏠</span>
                              <span className="action-text">{t('sidebar.actions.rtl')}</span>
                            </button>
                            <button className="action-button auto">
                              <span className="action-icon">🤖</span>
                              <span className="action-text">{t('sidebar.actions.auto')}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Botón para abrir/cerrar sidebar */}
      <button 
        className={`sidebar-toggle ${sidebarOpen ? 'open' : 'closed'}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? 'Cerrar panel' : 'Abrir panel'}
      >
        {sidebarOpen ? '›' : '‹'}
      </button>

      {/* Controles del mapa */}
      <div className={`map-controls ${leftSidebarOpen ? 'shifted' : ''}`}>
        <button 
          className={`map-control-btn ${mapLayer === 'street' ? 'active' : ''}`}
          onClick={() => setMapLayer('street')}
          title={t('map.controls.streetView')}
        >
          🗺️
        </button>
        <button 
          className={`map-control-btn ${mapLayer === 'satellite' ? 'active' : ''}`}
          onClick={() => setMapLayer('satellite')}
          title={t('map.controls.satelliteView')}
        >
          🛰️
        </button>
        <button 
          className={`map-control-btn ${followVehicle ? 'active' : ''}`}
          onClick={() => setFollowVehicle(!followVehicle)}
          title={followVehicle ? t('map.controls.unlockView') : t('map.controls.lockView')}
        >
          {followVehicle ? '🔒' : '🔓'}
        </button>
      </div>

      <MapContainer 
        center={defaultPosition} 
        zoom={13} 
        className="map-container"
        zoomControl={true}
      >
        {mapLayer === 'street' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        
        {vehicles.length > 0 && <MapController vehicles={vehicles} followVehicle={followVehicle} />}
        <MapEventHandler onContextMenu={handleMapContextMenu} />
        
        {vehicles.map((vehicle) => (
          <Marker 
            key={vehicle.systemId}
            position={[vehicle.lat, vehicle.lon]}
            icon={createVehicleIcon(vehicle.systemId, vehicle.connected, vehicle.heading || 0)}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>{t('map.vehicle')} #{vehicle.systemId}</h3>
                <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                  <div><strong>{t('map.status')}:</strong> {vehicle.connected ? t('map.connected') : t('map.disconnected')}</div>
                  <div><strong>{t('map.position')}:</strong> {vehicle.lat.toFixed(6)}, {vehicle.lon.toFixed(6)}</div>
                  <div><strong>{t('map.altitude')}:</strong> {vehicle.alt?.toFixed(1)} m</div>
                  <div><strong>{t('map.battery')}:</strong> {vehicle.battery_remaining?.toFixed(0)}% ({vehicle.battery_voltage?.toFixed(1)}V)</div>
                  <div><strong>{t('map.gps')}:</strong> {vehicle.gps_satellites} sats (Fix: {vehicle.gps_fix_type})</div>
                  <div><strong>{t('map.signal')}:</strong> {vehicle.signal_strength?.toFixed(0)}%</div>
                  <div><strong>{t('map.speed')}:</strong> {vehicle.groundspeed?.toFixed(1)} m/s</div>
                  <div><strong>{t('map.heading')}:</strong> {vehicle.heading?.toFixed(0)}°</div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        
        {/* Marcador del punto de menú contextual */}
        {contextMenu.show && (
          <Marker 
            position={[contextMenu.lat, contextMenu.lng]} 
            icon={contextMarkerIcon}
          />
        )}
      </MapContainer>

      {/* Menú contextual del mapa */}
      {contextMenu.show && (
        <>
          <div 
            className="context-menu-overlay" 
            onClick={closeContextMenu}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div 
            className="context-menu"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="context-menu-header">
              <span className="context-menu-coords">
                {contextMenu.lat.toFixed(6)}, {contextMenu.lng.toFixed(6)}
              </span>
              <button className="context-menu-close" onClick={closeContextMenu}>✕</button>
            </div>
            <div className="context-menu-items">
              <button className="context-menu-item" onClick={handleCenterHere}>
                <span className="context-menu-icon">🎯</span>
                <span>{t('map.contextMenu.centerHere')}</span>
              </button>
              <button className="context-menu-item" onClick={handleAddWaypoint}>
                <span className="context-menu-icon">📍</span>
                <span>{t('map.contextMenu.addWaypoint')}</span>
              </button>
              <button className="context-menu-item" onClick={handleCopyCoordinates}>
                <span className="context-menu-icon">📋</span>
                <span>{t('map.contextMenu.copyCoordinates')}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal de resultado */}
      <Modal
        isOpen={resultModal.isOpen}
        onClose={() => setResultModal({ isOpen: false, title: '', message: '', type: 'info' })}
        title={resultModal.title}
        message={resultModal.message}
        type={resultModal.type}
      />
    </div>
  )
}

export default MainContent
