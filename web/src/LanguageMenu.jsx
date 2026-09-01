import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import CountryFlag from 'react-country-flag';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle } from 'react-icons/fa';

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
      <Button
        variant="outline-secondary"
        size="sm"
        className="d-inline-flex align-items-center"
        onClick={() => setShow(true)}
        title={label}
        aria-label={label}
      >
        {getLanguageFlag(i18n.language)}
      </Button>

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
                <span className="d-inline-flex align-items-center gap-2">
                  <span className="d-inline-flex fs-5">{getLanguageFlag(lang)}</span>
                  <span>{getLanguageDisplayName(lang)}</span>
                </span>
                {i18n.language === lang ? (
                  <FaCheckCircle className="text-success" aria-hidden />
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
