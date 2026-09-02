import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import CountryFlag from 'react-country-flag';
import { useTranslation } from 'react-i18next';
import { FaCircleCheck } from 'react-icons/fa6';

import { savePreferences } from './auth';
import { supportedLanguages } from './i18n';

export const getLanguageFlag = languageCode => {
  const code = languageCode || 'en';
  try {
    const locale = new Intl.Locale(code);
    const region = locale.region || locale.maximize().region;
    if (region) {
      return <CountryFlag countryCode={region} svg title={region} />;
    }
  } catch {
    return '🌐';
  }
  return '🌐';
};

export const getLanguageDisplayName = languageCode => {
  const code = languageCode || 'en';
  try {
    const displayNames = new Intl.DisplayNames([code], { type: 'language' });
    const name = displayNames.of(code);
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
};

const LanguageMenu = () => {
  const { t, i18n } = useTranslation();
  const [show, setShow] = useState(false);
  const label = `${t('header.language')}: ${getLanguageDisplayName(i18n.language)}`;

  const changeLanguage = async lang => {
    await i18n.changeLanguage(lang);
    savePreferences({ language: lang });
    setShow(false);
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-link nav-link cluster-btn"
        onClick={() => setShow(true)}
        title={label}
        aria-label={label}
      >
        {getLanguageFlag(i18n.language)}
      </button>

      <Modal show={show} onHide={() => setShow(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('languageModal.title')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="list-group">
            {supportedLanguages.map(lang => (
              <button
                key={lang}
                type="button"
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                  i18n.language === lang ? 'border-primary border-2' : ''
                }`}
                onClick={() => changeLanguage(lang)}
              >
                <span>
                  <span className="me-2 flag-icon-lg">{getLanguageFlag(lang)}</span>
                  {getLanguageDisplayName(lang)}
                </span>
                {i18n.language === lang ? (
                  <FaCircleCheck className="text-success" aria-hidden />
                ) : null}
              </button>
            ))}
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
};

export default LanguageMenu;
