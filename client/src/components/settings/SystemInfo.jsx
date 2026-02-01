import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import TouchCalibration from '../TouchCalibration'
import './SystemInfo.css'

function SystemInfo() {
  const { t } = useTranslation()
  const [systemInfo, setSystemInfo] = useState(null)
  const [displayInfo, setDisplayInfo] = useState(null)
  const [devices, setDevices] = useState(null)
  const [networkInfo, setNetworkInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [showCalibration, setShowCalibration] = useState(false)

  useEffect(() => {
    fetchSystemInfo()
    fetchDisplayInfo()
    fetchDevices()
    fetchNetworkInfo()
  }, [])

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

      <div className="calibration-section">
        <h4 className="subsection-title">🎯 {t('systemInfo.touchCalibration')}</h4>
        <p className="subsection-description">
          {t('systemInfo.touchCalibrationDescription')}
        </p>
        <button 
          className="btn-calibrate"
          onClick={() => setShowCalibration(true)}
        >
          🎯 {t('systemInfo.calibrateTouch')}
        </button>
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
      </div>

      <div className="system-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'display' && renderDisplay()}
        {activeTab === 'devices' && renderDevices()}
        {activeTab === 'network' && renderNetwork()}
      </div>

      <div className="refresh-section">
        <button 
          className="refresh-button"
          onClick={() => {
            fetchSystemInfo()
            fetchDisplayInfo()
            fetchDevices()
            fetchNetworkInfo()
          }}
        >
          🔄 {t('systemInfo.refresh')}
        </button>
      </div>

      {showCalibration && (
        <TouchCalibration 
          onClose={() => setShowCalibration(false)}
          onComplete={(matrix) => {
            setShowCalibration(false)
            fetchDisplayInfo()
          }}
        />
      )}
    </div>
  )
}

export default SystemInfo
