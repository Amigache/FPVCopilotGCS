import { useTranslation } from 'react-i18next'
import './AboutUs.css'

function AboutUs() {
  const { t } = useTranslation()
  
  return (
    <div className="settings-section">
      <h2 className="section-title">{t('about.title')}</h2>
      <p className="section-description">
        {t('about.description')}
      </p>

      <div className="settings-card">
        <div className="about-header">
          <div className="app-logo">🚁</div>
          <div className="app-info">
            <h3 className="app-name">FPV Copilot GCS</h3>
            <p className="app-version">{t('about.version')} 1.0.0</p>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">{t('about.descriptionTitle')}</h3>
        <p className="about-text">
          {t('about.descriptionText')}
        </p>
      </div>

      <div className="settings-card">
        <h3 className="card-title">{t('about.featuresTitle')}</h3>
        <ul className="features-list">
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>{t('about.featuresList.interface')}</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>{t('about.featuresList.maps')}</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>{t('about.featuresList.telemetry')}</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>{t('about.featuresList.connections')}</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>MAVLink Serial/TCP/UDP completo</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>WebSocket para telemetría en tiempo real</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>Gestión completa de parámetros ArduPilot</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>Vehicle Config (Modos, Servos, Puertos)</span>
          </li>
          <li className="feature-item">
            <span className="feature-icon">✅</span>
            <span>{t('about.featuresList.optimized')}</span>
          </li>
        </ul>
      </div>

      <div className="settings-card">
        <h3 className="card-title">{t('about.technologiesTitle')}</h3>
        <div className="tech-grid">
          <div className="tech-item">
            <span className="tech-name">React</span>
            <span className="tech-version">18.2.0</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Node.js</span>
            <span className="tech-version">Express + Socket.IO</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">MAVLink</span>
            <span className="tech-version">v1.0/v2.0</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Leaflet</span>
            <span className="tech-version">Maps + React Leaflet</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">Vite</span>
            <span className="tech-version">5.0</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">SerialPort</span>
            <span className="tech-version">13.x</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">i18next</span>
            <span className="tech-version">Multiidioma</span>
          </div>
          <div className="tech-item">
            <span className="tech-name">WebSocket</span>
            <span className="tech-version">Tiempo real</span>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="card-title">{t('about.systemInfoTitle')}</h3>
        <div className="system-info">
          <div className="info-row">
            <span className="info-label">{t('about.platform')}:</span>
            <span className="info-value">Raspberry Pi Zero</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('about.os')}:</span>
            <span className="info-value">Raspberry Pi OS</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t('about.browser')}:</span>
            <span className="info-value">Chromium (Modo Kiosk)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AboutUs
