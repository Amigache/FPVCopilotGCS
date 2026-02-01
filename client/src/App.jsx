import { useState, useEffect } from 'react'
import './App.css'
import TopBar from './components/TopBar'
import BottomBar from './components/BottomBar'
import MainContent from './components/MainContent'
import Settings from './components/Settings'
import VehicleConfig from './components/VehicleConfig'
import UnifiedModal from './components/UnifiedModal'
import ToastContainer from './components/ToastContainer'
import { NotificationProvider, useNotification } from './contexts/NotificationContext'
import { ParametersProvider } from './contexts/ParametersContext'
import { WebSocketProvider, useWebSocketContext } from './contexts/WebSocketContext'
import { useTranslation } from 'react-i18next'

function AppContent() {
  const { t } = useTranslation()
  const notify = useNotification()
  const { selectedVehicleId: wsSelectedVehicleId } = useWebSocketContext()
  const [currentView, setCurrentView] = useState('main') // 'main', 'settings', 'vehicleConfig'
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, systemId: null })
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
        const successMessage = result.message || (action === 'arm' ? t('sidebar.actions.armSuccessMessage') : t('sidebar.actions.disarmSuccessMessage'))
        notify.success(successMessage)
      } else {
        const errorMessage = result.message || (action === 'arm' ? t('sidebar.actions.armErrorMessage') : t('sidebar.actions.disarmErrorMessage'))
        notify.error(errorMessage)
      }
    } catch (error) {
      setActionLoading(false)
      setConfirmModal({ isOpen: false, action: null, systemId: null })
      notify.error(t('sidebar.actions.connectionErrorMessage'))
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
        return <Settings onClose={() => setCurrentView('main')} />
      case 'vehicleConfig':
        // Usar wsSelectedVehicleId del contexto WebSocket como fallback
        const vehicleIdToUse = selectedVehicleId || wsSelectedVehicleId
        return <VehicleConfig systemId={vehicleIdToUse} onClose={handleCloseVehicleConfig} />
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
      {renderView()}      <BottomBar />      
      {/* Toast notifications */}
      <ToastContainer />
      
      {/* Modal de confirmación global para arm/disarm */}
      <UnifiedModal
        isOpen={confirmModal.isOpen}
        onClose={() => !actionLoading && setConfirmModal({ isOpen: false, action: null, systemId: null })}
        title={confirmModal.title}
        message={confirmModal.message}
        type="danger"
        closeOnBackdrop={!actionLoading}
        buttons={[
          {
            label: t('modal.cancel'),
            onClick: () => setConfirmModal({ isOpen: false, action: null, systemId: null }),
            variant: 'cancel',
            disabled: actionLoading
          },
          {
            label: t('modal.confirm'),
            onClick: executeArmDisarm,
            variant: 'confirm',
            loading: actionLoading
          }
        ]}
      />
    </div>
  )
}

// Wrapper principal con providers
function App() {
  return (
    <NotificationProvider>
      <WebSocketProvider>
        <ParametersProvider>
          <AppContent />
        </ParametersProvider>
      </WebSocketProvider>
    </NotificationProvider>
  )
}

export default App
