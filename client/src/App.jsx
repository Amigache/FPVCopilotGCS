import { useState } from 'react'
import './App.css'
import TopBar from './components/TopBar'
import MainContent from './components/MainContent'
import Settings from './components/Settings'
import VehicleConfig from './components/VehicleConfig'
import ConfirmModal from './components/ConfirmModal'
import Modal from './components/Modal'
import { useTranslation } from 'react-i18next'

function App() {
  const { t } = useTranslation()
  const [currentView, setCurrentView] = useState('main') // 'main', 'settings', 'vehicleConfig'
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, systemId: null })
  const [resultModal, setResultModal] = useState({ isOpen: false, title: '', message: '', type: 'info' })
  const [actionLoading, setActionLoading] = useState(false)

  const handleArmDisarmRequest = (action, systemId) => {
    setConfirmModal({
      isOpen: true,
      action: action,
      systemId: systemId,
      title: action === 'arm' ? t('sidebar.actions.armConfirmTitle') : t('sidebar.actions.disarmConfirmTitle'),
      message: action === 'arm' ? t('sidebar.actions.armConfirmMessage') : t('sidebar.actions.disarmConfirmMessage')
    })
  }

  const executeArmDisarm = async () => {
    const { action, systemId } = confirmModal
    if (!action || !systemId) return

    setActionLoading(true)

    try {
      const response = await fetch(`/api/mavlink/command/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemId })
      })

      const result = await response.json()
      setActionLoading(false)
      setConfirmModal({ isOpen: false, action: null, systemId: null })

      if (result.success) {
        setResultModal({
          isOpen: true,
          title: action === 'arm' ? t('sidebar.actions.armSuccess') : t('sidebar.actions.disarmSuccess'),
          message: result.message || (action === 'arm' ? t('sidebar.actions.armSuccessMessage') : t('sidebar.actions.disarmSuccessMessage')),
          type: 'success'
        })
      } else {
        setResultModal({
          isOpen: true,
          title: action === 'arm' ? t('sidebar.actions.armError') : t('sidebar.actions.disarmError'),
          message: result.message || (action === 'arm' ? t('sidebar.actions.armErrorMessage') : t('sidebar.actions.disarmErrorMessage')),
          type: 'error'
        })
      }
    } catch (error) {
      setActionLoading(false)
      setConfirmModal({ isOpen: false, action: null, systemId: null })
      setResultModal({
        isOpen: true,
        title: t('sidebar.actions.connectionError'),
        message: t('sidebar.actions.connectionErrorMessage'),
        type: 'error'
      })
    }
  }

  const toggleSettings = () => {
    setCurrentView(currentView === 'settings' ? 'main' : 'settings')
  }

  const handleVehicleConfigClick = (systemId) => {
    setSelectedVehicleId(systemId)
    setCurrentView('vehicleConfig')
  }

  const handleCloseVehicleConfig = () => {
    setCurrentView('main')
    setSelectedVehicleId(null)
  }

  const renderView = () => {
    switch (currentView) {
      case 'settings':
        return <Settings />
      case 'vehicleConfig':
        return <VehicleConfig systemId={selectedVehicleId} onClose={handleCloseVehicleConfig} />
      case 'main':
      default:
        return <MainContent onVehicleConfigClick={handleVehicleConfigClick} onArmDisarmRequest={handleArmDisarmRequest} />
    }
  }

  return (
    <div className="app-container">
      <TopBar 
        onSettingsClick={toggleSettings}
        isSettingsOpen={currentView === 'settings'}
        onArmDisarmRequest={handleArmDisarmRequest}
      />
      {renderView()}
      
      {/* Modal de confirmación global */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => !actionLoading && setConfirmModal({ isOpen: false, action: null, systemId: null })}
        onConfirm={executeArmDisarm}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        isLoading={actionLoading}
      />

      {/* Modal de resultado global */}
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

export default App
