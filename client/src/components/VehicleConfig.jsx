import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './VehicleConfig.css'
import Parameters from './vehicle-config/Parameters'
import Servos from './vehicle-config/Servos'
import FlightModes from './vehicle-config/FlightModes'
import SerialPorts from './vehicle-config/SerialPorts'
import UnifiedModal from './UnifiedModal'
import { useNotification } from '../contexts/NotificationContext'

function VehicleConfig({ systemId, onClose }) {
  const { t } = useTranslation()
  const notify = useNotification()
  const [activeTab, setActiveTab] = useState('flightModes')
  const [pendingTab, setPendingTab] = useState(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Refs para acceder a los métodos de los componentes hijos
  const flightModesRef = useRef(null)
  const serialPortsRef = useRef(null)
  const servosRef = useRef(null)

  const menuItems = [
    { id: 'flightModes', label: t('vehicleConfig.flightModes'), icon: '✈️' },
    { id: 'serialPorts', label: t('vehicleConfig.serialPorts'), icon: '🔌' },
    { id: 'servos', label: t('vehicleConfig.servos'), icon: '🛩️' },
    { id: 'parameters', label: t('vehicleConfig.parameters'), icon: '⚙️' }
  ]

  const checkUnsavedChanges = () => {
    let hasChanges = false
    let componentRef = null

    switch (activeTab) {
      case 'flightModes':
        componentRef = flightModesRef.current
        break
      case 'serialPorts':
        componentRef = serialPortsRef.current
        break
      case 'servos':
        componentRef = servosRef.current
        break
      // Parameters no tiene cambios sin guardar (guarda inmediatamente)
      default:
        break
    }

    if (componentRef && typeof componentRef.hasUnsavedChanges === 'function') {
      hasChanges = componentRef.hasUnsavedChanges()
    }

    return hasChanges
  }

  const handleTabChange = (newTab) => {
    if (newTab === activeTab) return

    const hasUnsaved = checkUnsavedChanges()
    
    if (hasUnsaved) {
      setPendingTab(newTab)
      setShowConfirmModal(true)
    } else {
      setActiveTab(newTab)
    }
  }

  const handleConfirmDiscard = () => {
    setShowConfirmModal(false)
    if (pendingTab) {
      // Llamar al reset del componente actual si existe
      let componentRef = null
      switch (activeTab) {
        case 'flightModes':
          componentRef = flightModesRef.current
          break
        case 'serialPorts':
          componentRef = serialPortsRef.current
          break
        case 'servos':
          componentRef = servosRef.current
          break
      }
      
      if (componentRef && typeof componentRef.resetChanges === 'function') {
        componentRef.resetChanges()
      }
      
      setActiveTab(pendingTab)
      setPendingTab(null)
    }
  }

  const handleConfirmSave = async () => {
    setSaving(true)
    
    // Llamar al save del componente actual
    let componentRef = null
    let sectionName = ''
    
    switch (activeTab) {
      case 'flightModes':
        componentRef = flightModesRef.current
        sectionName = t('vehicleConfig.flightModes')
        break
      case 'serialPorts':
        componentRef = serialPortsRef.current
        sectionName = t('vehicleConfig.serialPorts')
        break
      case 'servos':
        componentRef = servosRef.current
        sectionName = t('vehicleConfig.servos')
        break
    }
    
    try {
      if (componentRef && typeof componentRef.saveChanges === 'function') {
        await componentRef.saveChanges()
      }
      
      // Mostrar notificación de éxito con toast
      notify.success(t('vehicleConfig.saveSuccess.message', { section: sectionName }))
      
      // Cambiar de tab después de guardar
      if (pendingTab) {
        setTimeout(() => {
          setActiveTab(pendingTab)
          setPendingTab(null)
        }, 300)
      }
    } catch (error) {
      console.error('Error guardando cambios:', error)
      
      // Mostrar notificación de error con toast
      notify.error(t('vehicleConfig.saveError.message', { section: sectionName }))
    } finally {
      setSaving(false)
      setShowConfirmModal(false)
    }
  }

  const handleCancelModal = () => {
    setShowConfirmModal(false)
    setPendingTab(null)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'flightModes':
        return <FlightModes ref={flightModesRef} systemId={systemId} />
      case 'serialPorts':
        return <SerialPorts ref={serialPortsRef} systemId={systemId} />
      case 'parameters':
        return <Parameters systemId={systemId} />
      case 'servos':
        return <Servos ref={servosRef} systemId={systemId} />
      default:
        return <FlightModes ref={flightModesRef} systemId={systemId} />
    }
  }

  return (
    <div className="vehicle-config-container">
      {/* Modal de confirmación para cambios sin guardar */}
      <UnifiedModal
        isOpen={showConfirmModal}
        title={t('vehicleConfig.unsavedChanges.title')}
        message={t('vehicleConfig.unsavedChanges.message')}
        type="warning"
        closeOnBackdrop={!saving}
        buttons={[
          {
            label: t('vehicleConfig.unsavedChanges.discard'),
            onClick: handleConfirmDiscard,
            variant: 'cancel',
            disabled: saving
          },
          {
            label: t('modal.cancel'),
            onClick: handleCancelModal,
            variant: 'secondary',
            disabled: saving
          },
          {
            label: t('vehicleConfig.unsavedChanges.save'),
            onClick: handleConfirmSave,
            variant: 'confirm',
            loading: saving
          }
        ]}
      />
      
      <div className="vehicle-config-sidebar">
        <div className="vehicle-config-header">
          <h2 className="vehicle-config-title">
            {t('vehicleConfig.title')} #{systemId}
          </h2>
          <button className="close-button" onClick={onClose} title={t('vehicleConfig.close')}>
            ✕
          </button>
        </div>
        <nav className="vehicle-config-menu">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`menu-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="vehicle-config-content">
        {renderContent()}
      </div>
    </div>
  )
}

export default VehicleConfig
