import PropTypes from 'prop-types';
import { useState } from 'react';
import { Dropdown, Modal } from 'react-bootstrap';
import CountryFlag from 'react-country-flag';
import { useTranslation } from 'react-i18next';
import {
  FaBug,
  FaBuilding,
  FaPalette,
  FaSignInAlt,
  FaSignOutAlt,
  FaStar,
  FaTicketAlt,
  FaUserCircle,
} from 'react-icons/fa';

import { useTheme } from './contexts/ThemeContext.jsx';
import { supportedLanguages } from './i18n';

const TICKET_BASE_URL = 'https://xd.prominic.net/app/apprequest.nsf/router?openagent';
const TICKET_REQ_TYPE = 'sso';
const TICKET_CONTEXT = 'https://github.com/STARTcloud/provisioner-catalog';

const getLanguageFlag = languageCode => {
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

const getLanguageDisplayName = languageCode => {
  const code = languageCode || 'en';
  try {
    const displayNames = new Intl.DisplayNames([code], { type: 'language' });
    const name = displayNames.of(code);
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
};

const buildTicketUrl = (user, userInfo) => {
  const params = new URLSearchParams({
    req: TICKET_REQ_TYPE,
    customerId: userInfo?.customer_id || '',
    user: user?.name || '',
    email: user?.email || '',
    context: TICKET_CONTEXT,
  });
  return `${TICKET_BASE_URL}&${params.toString()}`;
};

const UserMenu = ({ user = null, userInfo = null, organizations = [], onSignIn, onSignOut }) => {
  const { t, i18n } = useTranslation();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const { toggleTheme, getThemeDisplay } = useTheme();

  const changeLanguage = async lang => {
    await i18n.changeLanguage(lang);
    setShowLanguageModal(false);
  };

  const jumpToOrg = uuid => {
    document.getElementById(`org-${uuid}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  const favoriteApps = userInfo?.favorite_apps || [];

  return (
    <>
      <Dropdown align="end">
        <Dropdown.Toggle
          variant="outline-secondary"
          size="sm"
          className="d-flex align-items-center gap-2"
          aria-label={t('header.menuAria')}
        >
          <FaUserCircle aria-hidden />
          <span className="text-truncate user-menu-name">
            {user ? user.name || user.email || t('header.signedIn') : t('header.signIn')}
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item
            as="button"
            type="button"
            onClick={toggleTheme}
            className="d-flex align-items-center gap-2"
          >
            <FaPalette aria-hidden />
            <span>
              {t('header.theme')}: {getThemeDisplay().replace(/\s*\([^)]*\)/g, '')}
            </span>
          </Dropdown.Item>

          <Dropdown.Item
            as="button"
            type="button"
            onClick={() => setShowLanguageModal(true)}
            className="d-flex align-items-center gap-2"
          >
            <span className="d-inline-flex">{getLanguageFlag(i18n.language)}</span>
            <span>{getLanguageDisplayName(i18n.language)}</span>
          </Dropdown.Item>

          {organizations.length > 0 ? (
            <>
              <Dropdown.Divider />
              <Dropdown.Header>{t('header.organizations')}</Dropdown.Header>
              {organizations.map(org => (
                <Dropdown.Item
                  as="button"
                  type="button"
                  key={org.uuid}
                  onClick={() => jumpToOrg(org.uuid)}
                  className="d-flex align-items-center gap-2"
                >
                  <FaBuilding aria-hidden />
                  <span className="text-truncate">{org.name}</span>
                </Dropdown.Item>
              ))}
            </>
          ) : null}

          {favoriteApps.length > 0 ? (
            <>
              <Dropdown.Divider />
              <Dropdown.Header>{t('header.favorites')}</Dropdown.Header>
              {[...favoriteApps]
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(app => (
                  <Dropdown.Item
                    key={app.clientId}
                    href={app.homeUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="d-flex align-items-center gap-2"
                  >
                    <FaStar className="text-warning" aria-hidden />
                    <span className="text-truncate">
                      {app.customLabel || app.clientName || app.clientId}
                    </span>
                  </Dropdown.Item>
                ))}
            </>
          ) : null}

          <Dropdown.Divider />
          {user ? (
            <Dropdown.Item
              href={buildTicketUrl(user, userInfo)}
              target="_blank"
              rel="noopener noreferrer"
              className="d-flex align-items-center gap-2"
            >
              <FaTicketAlt aria-hidden />
              <span>{t('header.helpSupport')}</span>
            </Dropdown.Item>
          ) : null}
          <Dropdown.Item
            href="https://github.com/STARTcloud/provisioner-catalog/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="d-flex align-items-center gap-2"
          >
            <FaBug aria-hidden />
            <span>{t('header.reportIssue')}</span>
          </Dropdown.Item>

          <Dropdown.Divider />
          {user ? (
            <Dropdown.Item
              as="button"
              type="button"
              onClick={onSignOut}
              className="d-flex align-items-center gap-2"
            >
              <FaSignOutAlt className="text-danger" aria-hidden />
              <span className="text-danger">{t('header.signOut')}</span>
            </Dropdown.Item>
          ) : (
            <Dropdown.Item
              as="button"
              type="button"
              onClick={onSignIn}
              className="d-flex align-items-center gap-2"
            >
              <FaSignInAlt className="text-success" aria-hidden />
              <span>{t('header.signIn')}</span>
            </Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown>

      <Modal show={showLanguageModal} onHide={() => setShowLanguageModal(false)} centered>
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
              </button>
            ))}
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
};

UserMenu.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string,
    email: PropTypes.string,
  }),
  userInfo: PropTypes.shape({
    customer_id: PropTypes.string,
    favorite_apps: PropTypes.array,
  }),
  organizations: PropTypes.arrayOf(
    PropTypes.shape({
      uuid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ),
  onSignIn: PropTypes.func.isRequired,
  onSignOut: PropTypes.func.isRequired,
};

export default UserMenu;
