import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import './Settings.css'
import General from './settings/General'
import Connections from './settings/Connections'
import Parameters from './settings/Parameters'
import AboutUs from './settings/AboutUs'

function Settings() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('general')

  const menuItems = [
    { id: 'general', label: t('settings.general'), icon: '🌐' },
    { id: 'connections', label: t('settings.connections'), icon: '🔌' },
    { id: 'parameters', label: t('settings.parameters'), icon: '⚙️' },
    { id: 'about', label: t('settings.about'), icon: 'ℹ️' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <General />
      case 'connections':
        return <Connections />
      case 'parameters':
        return <Parameters />
      case 'about':
        return <AboutUs />
      default:
        return <General />
    }
  }

  return (
    <div className="settings-container">
      <div className="settings-sidebar">
        <h2 className="settings-title">{t('settings.title')}</h2>
        <nav className="settings-menu">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`menu-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="settings-content">
        {renderContent()}
      </div>
    </div>
  )
}

export default Settings
