import { useTranslation } from 'react-i18next'
import './General.css'

function General() {
  const { t, i18n } = useTranslation()

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div className="settings-section">
      <h2 className="section-title">{t('general.title')}</h2>
      <p className="section-description">
        {t('general.description')}
      </p>

      <div className="settings-card">
        <h3 className="card-title">{t('general.language')}</h3>
        
        <div className="form-group">
          <label className="form-label">{t('general.selectLanguage')}</label>
          <select 
            className="form-input"
            value={i18n.language}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            <option value="en">🇬🇧 {t('general.english')}</option>
            <option value="es">🇪🇸 {t('general.spanish')}</option>
          </select>
        </div>

        <div className="language-info">
          <p className="info-text">
            ℹ️ {t('general.languageInfo')}
          </p>
        </div>
      </div>
    </div>
  )
}

export default General
