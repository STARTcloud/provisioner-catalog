import axios from 'axios';
import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { Dropdown, Modal, Spinner } from 'react-bootstrap';
import CountryFlag from 'react-country-flag';
import { useTranslation } from 'react-i18next';
import {
  FaBell,
  FaBellSlash,
  FaBuilding,
  FaIdBadge,
  FaSignInAlt,
  FaSignOutAlt,
  FaStar,
  FaSyncAlt,
  FaTicketAlt,
  FaUserCircle,
} from 'react-icons/fa';

import { getAccessToken, ISSUER, savePreferences } from './auth';
import { supportedLanguages } from './i18n';
import {
  isPushEnabled,
  isPushSupported,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
} from './push';

const TICKET_BASE_URL = 'https://xd.prominic.net/app/apprequest.nsf/router?openagent';
const TICKET_REQ_TYPE = 'sso';
const TICKET_CONTEXT = `provisioner-catalog|${__APP_VERSION__}`;
const FALLBACK_CUSTOMER_ID = 'A55DF1';

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
    customerId: userInfo?.customer_id || FALLBACK_CUSTOMER_ID,
    user: user?.name || '',
    email: user?.email || '',
    context: TICKET_CONTEXT,
  });
  return `${TICKET_BASE_URL}&${params.toString()}`;
};

const AppIcon = ({ app }) => {
  const [failed, setFailed] = useState(false);
  let iconUrl = app.iconUrl || '';
  if (!iconUrl && app.homeUrl) {
    try {
      iconUrl = `${new URL(app.homeUrl).origin}/favicon.ico`;
    } catch {
      iconUrl = '';
    }
  }
  if (!iconUrl || failed) {
    return <FaStar className="text-warning" aria-hidden />;
  }
  return <img src={iconUrl} alt="" width="16" height="16" onError={() => setFailed(true)} />;
};

AppIcon.propTypes = {
  app: PropTypes.shape({
    iconUrl: PropTypes.string,
    homeUrl: PropTypes.string,
  }).isRequired,
};

const UserMenu = ({ user = null, userInfo = null, organizations = [], onSignIn, onSignOut }) => {
  const { t, i18n } = useTranslation();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [pushOn, setPushOn] = useState(isPushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [menuFeedback, setMenuFeedback] = useState('');

  const changeLanguage = async lang => {
    await i18n.changeLanguage(lang);
    savePreferences({ language: lang });
    setShowLanguageModal(false);
  };

  const jumpToOrg = uuid => {
    setShowOrgModal(false);
    document.getElementById(`org-${uuid}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  const enablePush = async () => {
    if (!isPushSupported()) {
      setMenuFeedback(t('notifications.notSupported'));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setMenuFeedback(t('notifications.permissionDenied'));
      return;
    }
    await subscribePush();
    setPushEnabled(true);
    setPushOn(true);
    setMenuFeedback(t('notifications.enabled'));
  };

  const togglePush = async () => {
    setPushBusy(true);
    setMenuFeedback('');
    try {
      if (pushOn) {
        await unsubscribePush();
        setPushEnabled(false);
        setPushOn(false);
        setMenuFeedback(t('notifications.disabled'));
      } else {
        await enablePush();
      }
    } catch {
      setMenuFeedback(pushOn ? t('notifications.disableError') : t('notifications.enableError'));
    } finally {
      setPushBusy(false);
    }
  };

  const isAdmin = Boolean(user?.authorities?.includes('ROLE_ADMIN'));
  const [rebuildRunning, setRebuildRunning] = useState(false);
  const pollRef = useRef(null);
  const sawRunRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(
    () => () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    },
    []
  );

  const stopPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setRebuildRunning(false);
  };

  const pollRebuild = () => {
    sawRunRef.current = false;
    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 90) {
        stopPolling();
        return;
      }
      try {
        const token = await getAccessToken();
        const { data } = await axios.get('/admin/rebuild/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data.status === 'queued' || data.status === 'in_progress') {
          sawRunRef.current = true;
        } else if (data.status === 'completed' && sawRunRef.current) {
          stopPolling();
          setMenuFeedback(
            data.conclusion === 'success'
              ? t('rebuild.done')
              : t('rebuild.failed', { message: data.conclusion || 'unknown' })
          );
        }
      } catch {
        stopPolling();
      }
    }, 10000);
  };

  const rebuild = async () => {
    setMenuFeedback('');
    try {
      const token = await getAccessToken();
      await axios.post('/admin/rebuild', null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMenuFeedback(t('rebuild.running'));
      setRebuildRunning(true);
      pollRebuild();
    } catch (rebuildError) {
      setMenuFeedback(t('rebuild.failed', { message: rebuildError.message }));
    }
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
          {userInfo?.picture ? (
            <img src={userInfo.picture} alt="" width="20" height="20" className="rounded-circle" />
          ) : (
            <FaUserCircle aria-hidden />
          )}
          <span className="text-truncate user-menu-name">
            {user ? user.name || user.email || t('header.signedIn') : t('header.signIn')}
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu>
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
              <Dropdown.Item
                as="button"
                type="button"
                onClick={() => setShowOrgModal(true)}
                className="d-flex align-items-center gap-2"
              >
                <FaBuilding aria-hidden />
                <span>{t('header.organizations')}</span>
              </Dropdown.Item>
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
                    <AppIcon app={app} />
                    <span className="text-truncate">
                      {app.customLabel || app.clientName || app.clientId}
                    </span>
                  </Dropdown.Item>
                ))}
            </>
          ) : null}

          {user ? (
            <>
              <Dropdown.Divider />
              <Dropdown.Item
                href={`${ISSUER}/user/profile`}
                target="_blank"
                rel="noopener noreferrer"
                className="d-flex align-items-center gap-2"
              >
                <FaIdBadge aria-hidden />
                <span>{t('header.profile')}</span>
              </Dropdown.Item>
              <Dropdown.Item
                as="button"
                type="button"
                onClick={togglePush}
                disabled={pushBusy}
                className="d-flex align-items-center gap-2"
              >
                {pushOn ? <FaBellSlash aria-hidden /> : <FaBell aria-hidden />}
                <span>{pushOn ? t('notifications.disable') : t('notifications.enable')}</span>
              </Dropdown.Item>
              {isAdmin ? (
                <Dropdown.Item
                  as="button"
                  type="button"
                  onClick={rebuild}
                  disabled={rebuildRunning}
                  className="d-flex align-items-center gap-2"
                >
                  {rebuildRunning ? (
                    <Spinner animation="border" size="sm" role="status" />
                  ) : (
                    <FaSyncAlt aria-hidden />
                  )}
                  <span>{t('header.rebuild')}</span>
                </Dropdown.Item>
              ) : null}
              <Dropdown.Item
                href={buildTicketUrl(user, userInfo)}
                target="_blank"
                rel="noopener noreferrer"
                className="d-flex align-items-center gap-2"
              >
                <FaTicketAlt aria-hidden />
                <span>{t('header.helpSupport')}</span>
              </Dropdown.Item>
              {menuFeedback ? (
                <Dropdown.ItemText className="small">{menuFeedback}</Dropdown.ItemText>
              ) : null}
            </>
          ) : null}

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

      <Modal show={showOrgModal} onHide={() => setShowOrgModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center gap-2">
            <FaBuilding aria-hidden />
            {t('header.organizations')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="list-group">
            {organizations.map(org => (
              <button
                key={org.uuid}
                type="button"
                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                onClick={() => jumpToOrg(org.uuid)}
              >
                <span className="d-inline-flex align-items-center gap-2">
                  {org.logo ? (
                    <img
                      src={org.logo}
                      alt=""
                      width="20"
                      height="20"
                      className="rounded-circle"
                      onError={event => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <FaBuilding aria-hidden />
                  )}
                  <span>
                    <span className="fw-bold d-block">{org.name}</span>
                    {org.primary ? (
                      <small className="text-primary">{t('orgs.primary')}</small>
                    ) : null}
                  </span>
                </span>
                <span className="d-inline-flex gap-1">
                  {(org.roles || []).map(role => (
                    <span key={role} className="badge bg-secondary">
                      {role}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </Modal.Body>
      </Modal>

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
    authorities: PropTypes.arrayOf(PropTypes.string),
  }),
  userInfo: PropTypes.shape({
    customer_id: PropTypes.string,
    picture: PropTypes.string,
    favorite_apps: PropTypes.array,
  }),
  organizations: PropTypes.arrayOf(
    PropTypes.shape({
      uuid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      roles: PropTypes.arrayOf(PropTypes.string),
      primary: PropTypes.bool,
      logo: PropTypes.string,
    })
  ),
  onSignIn: PropTypes.func.isRequired,
  onSignOut: PropTypes.func.isRequired,
};

export default UserMenu;
