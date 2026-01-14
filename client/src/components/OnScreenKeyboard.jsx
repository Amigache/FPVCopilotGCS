import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './OnScreenKeyboard.css'

function OnScreenKeyboard({ isOpen, onClose, onSubmit, fieldName, initialValue = '', keyboardType = 'text' }) {
  const { t, i18n } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const [shift, setShift] = useState(false)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue, isOpen])

  if (!isOpen) return null

  // Layout de teclado según el idioma
  const keyboardLayouts = {
    es: {
      row1: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      row2: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      row3: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
      row4: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-']
    },
    en: {
      row1: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      row2: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      row3: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
      row4: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-']
    }
  }

  const numericLayout = {
    row1: ['1', '2', '3'],
    row2: ['4', '5', '6'],
    row3: ['7', '8', '9'],
    row4: ['.', '0', '-']
  }

  const currentLanguage = i18n.language?.startsWith('es') ? 'es' : 'en'
  const layout = keyboardType === 'number' ? numericLayout : keyboardLayouts[currentLanguage]

  const handleKeyPress = (key) => {
    const newValue = value + (shift && keyboardType !== 'number' ? key.toUpperCase() : key)
    setValue(newValue)
    if (shift) setShift(false) // Auto-desactivar shift después de una letra
  }

  const handleBackspace = () => {
    setValue(value.slice(0, -1))
  }

  const handleSpace = () => {
    setValue(value + ' ')
  }

  const handleClear = () => {
    setValue('')
  }

  const handleSubmit = () => {
    onSubmit(value)
    onClose()
  }

  const handleCancel = () => {
    setValue(initialValue)
    onClose()
  }

  return (
    <div className="keyboard-overlay">
      <div className="keyboard-container">
        {/* Header */}
        <div className="keyboard-header">
          <div className="keyboard-field-name">{fieldName}</div>
          <button className="keyboard-close-btn" onClick={handleCancel}>✕</button>
        </div>

        {/* Display */}
        <div className="keyboard-display">
          <div className="keyboard-display-text">{value || '\u00A0'}</div>
        </div>

        {/* Keyboard */}
        <div className="keyboard-keys">
          {/* Row 1 - Numbers */}
          <div className="keyboard-row">
            {layout.row1.map((key) => (
              <button
                key={key}
                className="keyboard-key"
                onClick={() => handleKeyPress(key)}
              >
                {key}
              </button>
            ))}
            <button className="keyboard-key keyboard-key-backspace" onClick={handleBackspace}>
              ⌫
            </button>
          </div>

          {/* Row 2 */}
          <div className="keyboard-row">
            {layout.row2.map((key) => (
              <button
                key={key}
                className="keyboard-key"
                onClick={() => handleKeyPress(key)}
              >
                {shift && keyboardType !== 'number' ? key.toUpperCase() : key}
              </button>
            ))}
          </div>

          {/* Row 3 */}
          <div className="keyboard-row">
            {layout.row3.map((key) => (
              <button
                key={key}
                className="keyboard-key"
                onClick={() => handleKeyPress(key)}
              >
                {shift && keyboardType !== 'number' ? key.toUpperCase() : key}
              </button>
            ))}
          </div>

          {/* Row 4 */}
          <div className="keyboard-row">
            {keyboardType !== 'number' && (
              <button
                className={`keyboard-key keyboard-key-shift ${shift ? 'active' : ''}`}
                onClick={() => setShift(!shift)}
              >
                ⇧
              </button>
            )}
            {layout.row4.map((key) => (
              <button
                key={key}
                className="keyboard-key"
                onClick={() => handleKeyPress(key)}
              >
                {shift && keyboardType !== 'number' ? key.toUpperCase() : key}
              </button>
            ))}
            {keyboardType !== 'number' && (
              <button className="keyboard-key keyboard-key-clear" onClick={handleClear}>
                ⌧
              </button>
            )}
          </div>

          {/* Row 5 - Special keys */}
          <div className="keyboard-row keyboard-row-bottom">
            <button className="keyboard-key keyboard-key-cancel" onClick={handleCancel}>
              ✕ {t('keyboard.cancel')}
            </button>
            {keyboardType !== 'number' && (
              <button className="keyboard-key keyboard-key-space" onClick={handleSpace}>
                {t('keyboard.space')}
              </button>
            )}
            <button className="keyboard-key keyboard-key-enter" onClick={handleSubmit}>
              ✓ {t('keyboard.enter')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnScreenKeyboard
