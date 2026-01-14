import { useState } from 'react'
import './App.css'
import TopBar from './components/TopBar'
import MainContent from './components/MainContent'
import Settings from './components/Settings'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen)
  }

  return (
    <div className="app-container">
      <TopBar 
        onSettingsClick={toggleSettings}
        isSettingsOpen={isSettingsOpen}
      />
      {isSettingsOpen ? <Settings /> : <MainContent />}
    </div>
  )
}

export default App
