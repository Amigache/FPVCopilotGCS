import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotification } from '../../contexts/NotificationContext'
import OnScreenKeyboard from '../OnScreenKeyboard'
import UnifiedModal from '../UnifiedModal'
import './SystemInfo.css'

function SystemInfo() {
  const { t } = useTranslation()
  const notify = useNotification()
  const [systemInfo, setSystemInfo] = useState(null)
  const [displayInfo, setDisplayInfo] = useState(null)
  const [devices, setDevices] = useState(null)
  const [networkInfo, setNetworkInfo] = useState(null)
  const [wifiNetworks, setWifiNetworks] = useState([])
  const [wifiStatus, setWifiStatus] = useState(null)
  const [wifiScanning, setWifiScanning] = useState(false)
  const [wifiConnecting, setWifiConnecting] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState(null)
  const [wifiPassword, setWifiPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [keyboard, setKeyboard] = useState({ isOpen: false, fieldName: '', initialValue: '' })
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', ssid: '' })

  useEffect(() => {
    fetchSystemInfo()
    fetchDisplayInfo()
    fetchDevices()
    fetchNetworkInfo()
    fetchWifiStatus()
  }, [])

  useEffect(() => {
    if (activeTab === 'wifi') {
      // Solo obtener estado, no escanear automáticamente
      fetchWifiStatus()
    }
  }, [activeTab])

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/system/info')
      const data = await response.json()
      setSystemInfo(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchDisplayInfo = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/system/display')
      const data = await response.json()
      setDisplayInfo(data)
    } catch (err) {
      console.error('Error fetching display info:', err)
    }
  }

  const fetchDevices = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/system/devices')
      const data = await response.json()
      setDevices(data)
    } catch (err) {
      console.error('Error fetching devices:', err)
    }
  }

  const fetchNetworkInfo = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/system/network')
      const data = await response.json()
      setNetworkInfo(data)
    } catch (err) {
      console.error('Error fetching network info:', err)
    }
  }

  const fetchWifiStatus = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/wifi/status')
      const data = await response.json()
      setWifiStatus(data)
    } catch (err) {
      console.error('Error fetching WiFi status:', err)
    }
  }

  const scanWifiNetworks = async () => {
    setWifiScanning(true)
    try {
      const response = await fetch('http://localhost:3000/api/wifi/scan')
      const data = await response.json()
      setWifiNetworks(data.networks || [])
    } catch (err) {
      console.error('Error scanning WiFi:', err)
      setWifiNetworks([])
    } finally {
      setWifiScanning(false)
    }
  }

  const connectToWifi = async () => {
    if (!selectedNetwork) return
    
    setWifiConnecting(true)
    try {
      const response = await fetch('http://localhost:3000/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          password: wifiPassword
        })
      })
      const data = await response.json()
      
      if (data.success) {
        notify.success(data.message)
        setSelectedNetwork(null)
        setWifiPassword('')
        fetchWifiStatus()
        scanWifiNetworks()
      } else {
        notify.error(data.message)
      }
    } catch (err) {
      notify.error(`Error: ${err.message}`)
    } finally {
      setWifiConnecting(false)
    }
  }

  const disconnectWifi = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/wifi/disconnect', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        notify.success(data.message)
        fetchWifiStatus()
        scanWifiNetworks()
      } else {
        notify.error(data.message)
      }
    } catch (err) {
      notify.error(`Error: ${err.message}`)
    }
    setConfirmModal({ isOpen: false, type: '', ssid: '' })
  }

  const forgetNetwork = async (ssid) => {
    try {
      const response = await fetch(`http://localhost:3000/api/wifi/forget/${encodeURIComponent(ssid)}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      
      if (data.success) {
        notify.success(data.message)
        fetchWifiStatus()
        scanWifiNetworks()
      } else {
        notify.error(data.message)
      }
    } catch (err) {
      notify.error(`Error: ${err.message}`)
    }
    setConfirmModal({ isOpen: false, type: '', ssid: '' })
  }

  const getSignalIcon = (signal) => {
    if (signal >= 75) return '📶'
    if (signal >= 50) return '📶'
    if (signal >= 25) return '📶'
    return '📶'
  }

  const getSignalColor = (signal) => {
    if (signal >= 75) return '#4caf50'
    if (signal >= 50) return '#ff9800'
    if (signal >= 25) return '#ff5722'
    return '#f44336'
  }

  const openKeyboard = (fieldName, initialValue = '') => {
    setKeyboard({ isOpen: true, fieldName, initialValue })
  }

  const closeKeyboard = () => {
    setKeyboard({ isOpen: false, fieldName: '', initialValue: '' })
  }

  const handleKeyboardSubmit = (value) => {
    setWifiPassword(value)
    closeKeyboard()
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days}d ${hours}h ${minutes}m`
  }

  if (loading) {
    return (
      <div className="settings-section">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('systemInfo.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="settings-section">
        <div className="error-container">
          <p className="error-text">❌ {t('systemInfo.error')}: {error}</p>
        </div>
      </div>
    )
  }

  const renderOverview = () => (
    <div className="system-cards-grid">
      <div className="settings-card">
        <h3 className="card-title">💻 {t('systemInfo.operatingSystem')}</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">{t('systemInfo.distribution')}:</span>
            <span className="info-value">
              {systemInfo?.osRelease?.NAME || systemInfo?.platform}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.version')}:</span>
            <span className="info-value">
              {systemInfo?.osRelease?.VERSION || 'N/A'}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.architecture')}:</span>
            <span className="info-value">{systemInfo?.arch}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.hostname')}:</span>
            <span className="info-value">{systemInfo?.hostname}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.uptime')}:</span>
            <span className="info-value">{formatUptime(systemInfo?.uptime || 0)}</span>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">🧠 {t('systemInfo.memory')}</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">{t('systemInfo.totalMemory')}:</span>
            <span className="info-value">{formatBytes(systemInfo?.totalmem || 0)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.freeMemory')}:</span>
            <span className="info-value">{formatBytes(systemInfo?.freemem || 0)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.usedMemory')}:</span>
            <span className="info-value">
              {formatBytes((systemInfo?.totalmem || 0) - (systemInfo?.freemem || 0))}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.memoryUsage')}:</span>
            <span className="info-value">
              {Math.round(((systemInfo?.totalmem - systemInfo?.freemem) / systemInfo?.totalmem) * 100)}%
            </span>
          </div>
        </div>
        <div className="memory-bar">
          <div 
            className="memory-bar-fill"
            style={{ 
              width: `${Math.round(((systemInfo?.totalmem - systemInfo?.freemem) / systemInfo?.totalmem) * 100)}%` 
            }}
          ></div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">⚙️ {t('systemInfo.processor')}</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">{t('systemInfo.cpuCores')}:</span>
            <span className="info-value">{systemInfo?.cpus?.length || 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.cpuModel')}:</span>
            <span className="info-value">{systemInfo?.cpus?.[0]?.model || 'N/A'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.cpuSpeed')}:</span>
            <span className="info-value">{systemInfo?.cpus?.[0]?.speed || 0} MHz</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('systemInfo.loadAverage')}:</span>
            <span className="info-value">
              {systemInfo?.loadavg?.map(l => l.toFixed(2)).join(', ') || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderDisplay = () => (
    <div className="settings-card">
      <h3 className="card-title">🖥️ {t('systemInfo.displayInfo')}</h3>
      <div className="info-grid">
        <div className="info-item">
          <span className="info-label">{t('systemInfo.displayEnv')}:</span>
          <span className="info-value">{displayInfo?.displayEnv || 'Not set'}</span>
        </div>
        {displayInfo?.resolution && (
          <div className="info-item">
            <span className="info-label">{t('systemInfo.resolution')}:</span>
            <span className="info-value">
              {displayInfo.resolution.width} x {displayInfo.resolution.height}
            </span>
          </div>
        )}
        {displayInfo?.connectedDisplays && displayInfo.connectedDisplays.length > 0 && (
          <div className="info-item full-width">
            <span className="info-label">{t('systemInfo.connectedDisplays')}:</span>
            <span className="info-value">
              {displayInfo.connectedDisplays.join(', ')}
            </span>
          </div>
        )}
        {displayInfo?.error && (
          <div className="info-item full-width">
            <span className="info-label">{t('systemInfo.status')}:</span>
            <span className="info-value warning">{displayInfo.error}</span>
          </div>
        )}
      </div>
    </div>
  )

  const renderDevices = () => (
    <div className="system-cards-grid">
      <div className="settings-card">
        <h3 className="card-title">🔌 {t('systemInfo.usbDevices')}</h3>
        <div className="devices-list">
          {devices?.usb && devices.usb.length > 0 ? (
            devices.usb.map((device, index) => (
              <div key={index} className="device-item">
                {device}
              </div>
            ))
          ) : (
            <p className="no-devices">{t('systemInfo.noDevices')}</p>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">📟 {t('systemInfo.serialPorts')}</h3>
        <div className="devices-list">
          {devices?.serial && devices.serial.length > 0 ? (
            devices.serial.map((port, index) => (
              <div key={index} className="device-item">
                {port}
              </div>
            ))
          ) : (
            <p className="no-devices">{t('systemInfo.noDevices')}</p>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">📹 {t('systemInfo.videoDevices')}</h3>
        <div className="devices-list">
          {devices?.video && devices.video.length > 0 ? (
            devices.video.map((device, index) => (
              <div key={index} className="device-item">
                {device}
              </div>
            ))
          ) : (
            <p className="no-devices">{t('systemInfo.noDevices')}</p>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">🔊 {t('systemInfo.audioDevices')}</h3>
        <div className="devices-list">
          {devices?.audio && devices.audio.length > 0 ? (
            devices.audio.map((device, index) => (
              <div key={index} className="device-item">
                {device}
              </div>
            ))
          ) : (
            <p className="no-devices">{t('systemInfo.noDevices')}</p>
          )}
        </div>
      </div>
    </div>
  )

  const renderNetwork = () => (
    <div className="settings-card">
      <h3 className="card-title">🌐 {t('systemInfo.networkInterfaces')}</h3>
      <div className="info-grid">
        <div className="info-item full-width">
          <span className="info-label">{t('systemInfo.hostname')}:</span>
          <span className="info-value">{networkInfo?.hostname}</span>
        </div>
      </div>
      <div className="network-interfaces">
        {networkInfo?.interfaces && Object.entries(networkInfo.interfaces).map(([name, addrs]) => (
          <div key={name} className="network-interface">
            <h4 className="interface-name">🔗 {name}</h4>
            {addrs.map((addr, index) => (
              <div key={index} className="address-info">
                <div className="info-item">
                  <span className="info-label">{t('systemInfo.family')}:</span>
                  <span className="info-value">{addr.family}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('systemInfo.address')}:</span>
                  <span className="info-value">{addr.address}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('systemInfo.netmask')}:</span>
                  <span className="info-value">{addr.netmask}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t('systemInfo.mac')}:</span>
                  <span className="info-value">{addr.mac}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  const renderWifi = () => (
    <div className="wifi-manager">
      {/* Estado actual WiFi */}
      {wifiStatus?.connected && (
        <div className="settings-card wifi-current">
          <h3 className="card-title">📶 {t('systemInfo.wifiCurrentNetwork')}</h3>
          <div className="wifi-current-info">
            <div className="wifi-current-details">
              <div className="wifi-current-ssid">{wifiStatus.ssid}</div>
              <div className="wifi-current-meta">
                <span style={{ color: getSignalColor(wifiStatus.signal) }}>
                  {getSignalIcon(wifiStatus.signal)} {wifiStatus.signal}%
                </span>
                <span>🔒 {wifiStatus.security}</span>
              </div>
            </div>
            <button 
              className="wifi-disconnect-btn"
              onClick={() => setConfirmModal({ isOpen: true, type: 'disconnect', ssid: wifiStatus.ssid })}
            >
              {t('systemInfo.wifiDisconnect')}
            </button>
          </div>
        </div>
      )}

      {/* Redes disponibles */}
      <div className="settings-card">
        <div className="card-header-with-action">
          <h3 className="card-title">📡 {t('systemInfo.wifiAvailableNetworks')}</h3>
          <button 
            className="wifi-scan-btn"
            onClick={scanWifiNetworks}
            disabled={wifiScanning}
          >
            {wifiScanning ? `🔄 ${t('systemInfo.wifiScanning')}` : `🔍 ${t('systemInfo.wifiScan')}`}
          </button>
        </div>

        <div className="wifi-networks-list">
          {wifiNetworks.length === 0 && !wifiScanning && (
            <div className="no-networks">
              <p>{t('systemInfo.wifiNoNetworks')}</p>
            </div>
          )}

          {wifiNetworks.map((network, index) => (
            <div 
              key={`${network.ssid}-${index}`}
              className={`wifi-network-item ${network.connected ? 'connected' : ''} ${selectedNetwork?.ssid === network.ssid ? 'selected' : ''}`}
              onClick={() => !network.connected && setSelectedNetwork(network)}
            >
              <div className="wifi-network-info">
                <div className="wifi-network-ssid">
                  {network.connected && '✓ '}{network.ssid}
                </div>
                <div className="wifi-network-meta">
                  <span style={{ color: getSignalColor(network.signal) }}>
                    {getSignalIcon(network.signal)} {network.signal}%
                  </span>
                  <span>{network.security !== 'Open' ? '🔒' : '🔓'} {network.security}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de conexión */}
      {selectedNetwork && (
        <div className="wifi-connect-modal">
          <div className="settings-card">
            <h3 className="card-title">🔑 {t('systemInfo.wifiConnectTo')} "{selectedNetwork.ssid}"</h3>
            
            {selectedNetwork.security !== 'Open' && (
              <div className="form-group">
                <label className="form-label">{t('systemInfo.wifiPassword')}:</label>
                <input
                  type="password"
                  className="form-input"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  onClick={() => openKeyboard(t('systemInfo.wifiPassword'), wifiPassword)}
                  placeholder={t('systemInfo.wifiPasswordPlaceholder')}
                  readOnly
                />
              </div>
            )}

            <div className="wifi-connect-actions">
              <button 
                className="btn-secondary"
                onClick={() => {
                  setSelectedNetwork(null)
                  setWifiPassword('')
                }}
                disabled={wifiConnecting}
              >
                {t('systemInfo.cancel')}
              </button>
              <button 
                className="btn-primary"
                onClick={connectToWifi}
                disabled={wifiConnecting || (selectedNetwork.security !== 'Open' && !wifiPassword)}
              >
                {wifiConnecting ? `⏳ ${t('systemInfo.wifiConnecting')}` : `✓ ${t('systemInfo.wifiConnect')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="settings-section">
      <h2 className="section-title">{t('systemInfo.title')}</h2>
      <p className="section-description">
        {t('systemInfo.description')}
      </p>

      <div className="system-tabs">
        <button 
          className={`system-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 {t('systemInfo.overview')}
        </button>
        <button 
          className={`system-tab ${activeTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveTab('display')}
        >
          🖥️ {t('systemInfo.display')}
        </button>
        <button 
          className={`system-tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          🔌 {t('systemInfo.devices')}
        </button>
        <button 
          className={`system-tab ${activeTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveTab('network')}
        >
          🌐 {t('systemInfo.network')}
        </button>
        <button 
          className={`system-tab ${activeTab === 'wifi' ? 'active' : ''}`}
          onClick={() => setActiveTab('wifi')}
        >
          📶 WiFi
        </button>
      </div>

      <div className="system-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'display' && renderDisplay()}
        {activeTab === 'devices' && renderDevices()}
        {activeTab === 'network' && renderNetwork()}
        {activeTab === 'wifi' && renderWifi()}
      </div>

      <OnScreenKeyboard
        isOpen={keyboard.isOpen}
        onClose={closeKeyboard}
        onSubmit={handleKeyboardSubmit}
        fieldName={keyboard.fieldName}
        initialValue={keyboard.initialValue}
        keyboardType="text"
      />

      <UnifiedModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, type: '', ssid: '' })}
        title={confirmModal.type === 'disconnect' ? t('systemInfo.wifiDisconnect') : t('systemInfo.wifiForget')}
        message={
          confirmModal.type === 'disconnect'
            ? t('systemInfo.wifiDisconnectConfirm')
            : `${t('systemInfo.wifiForgetConfirm')} "${confirmModal.ssid}"?`
        }
        type="warning"
        buttons={[
          {
            label: t('systemInfo.cancel'),
            onClick: () => setConfirmModal({ isOpen: false, type: '', ssid: '' }),
            variant: 'cancel'
          },
          {
            label: t('modal.confirm'),
            onClick: () => {
              if (confirmModal.type === 'disconnect') {
                disconnectWifi()
              } else if (confirmModal.type === 'forget') {
                forgetNetwork(confirmModal.ssid)
              }
            },
            variant: 'danger'
          }
        ]}
      />
    </div>
  )
}
    </div>
  )
}

export default SystemInfo
