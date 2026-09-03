import PropTypes from 'prop-types';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBook, FaCircleInfo, FaEnvelope } from 'react-icons/fa6';
import { Link } from 'react-router-dom';

import { AppChrome, Avatar, userDisplayName, userSecondaryLine } from './chrome';
import {
  APP_NAME,
  POWERED_BY,
  REPO_URL,
  VIEW_ALL_URL,
  buildTicketUrl,
  fetchHealth,
  getSupportedLanguages,
  notificationsAdapter,
  pushAdapter,
} from './chromeProps.jsx';
import { collections } from './collections.jsx';
import RebuildItem from './RebuildItem.jsx';
import { sessionStateShape } from './session';

const RESERVED_ROUTES = ['about', 'callback', 'docs', 'schema', 'private', 'push', 'admin'];

const AppRows = ({ isAdmin }) => {
  const { t } = useTranslation();
  return (
    <>
      {isAdmin ? <RebuildItem /> : null}
      <Dropdown.Item as={Link} to="/about">
        <FaCircleInfo className="me-2" />
        {t('navbar.about')}
      </Dropdown.Item>
      <Dropdown.Item
        href="https://startcloud.com/#contact"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FaEnvelope className="me-2" />
        {t('navbar.contact')}
      </Dropdown.Item>
      <Dropdown.Item href="/docs/">
        <FaBook className="me-2" />
        {t('navbar.docs')}
      </Dropdown.Item>
    </>
  );
};

AppRows.propTypes = {
  isAdmin: PropTypes.bool.isRequired,
};

const Shell = ({ account, onSignOut, theme, onChangeLanguage, children }) => {
  const { t } = useTranslation();
  const { user, claims, organizations, activeOrgUuid, issuerUrl } = account;
  const displayName = user ? claims?.name || userDisplayName(user) || t('user.unknownUser') : '';
  const picture = claims?.picture || '';
  const activeOrg = organizations.find(org => org.uuid === activeOrgUuid) || null;

  return (
    <AppChrome
      brand={{
        name: APP_NAME,
        logo: <img src="/startcloud.svg" alt="" className="logo-cluster icon-with-margin-sm" />,
        to: '/',
      }}
      links={[
        { key: 'about', label: t('navbar.about'), to: '/about' },
        { key: 'contact', label: t('navbar.contact'), href: 'https://startcloud.com/#contact' },
        { key: 'docs', label: t('navbar.docs'), href: '/docs/' },
      ]}
      LinkComponent={Link}
      reserved={RESERVED_ROUTES}
      collections={collections}
      theme={theme}
      language={{ languages: getSupportedLanguages(), onPick: onChangeLanguage }}
      user={user}
      identity={
        user
          ? {
              displayName,
              email: userSecondaryLine({ ...user, name: displayName }),
              renderAvatar: size => <Avatar picture={picture} size={size} />,
              oidc: account.oidc,
              issuerUrl,
              localProfile: null,
            }
          : null
      }
      orgs={{
        organizations,
        activeUuid: activeOrgUuid,
        onPick: account.pickOrg,
        load: null,
        mark: null,
        logoFor: name =>
          organizations.some(entry => entry.name === name)
            ? ''
            : `https://github.com/${name}.png?size=32`,
      }}
      menu={
        user
          ? {
              appName: t('navbar.provisionerCatalog'),
              appRows: <AppRows isAdmin={Boolean(user.authorities?.includes('ROLE_ADMIN'))} />,
              favorites: claims?.favorite_apps || [],
              notifications: String(user.scope || '').includes('notifications')
                ? notificationsAdapter
                : null,
              push: pushAdapter,
              viewAllUrl: VIEW_ALL_URL,
              ticketUrl: buildTicketUrl(user, claims, activeOrg),
            }
          : null
      }
      session={{
        onSignIn: account.signIn,
        onSignOut,
        onSignOutEverywhere: account.signOutEverywhere,
        ended: Boolean(account.sessionEnded),
      }}
      footer={{ version: __APP_VERSION__, repoUrl: REPO_URL, poweredBy: POWERED_BY, fetchHealth }}
    >
      {children}
    </AppChrome>
  );
};

Shell.propTypes = {
  account: sessionStateShape.isRequired,
  onSignOut: PropTypes.func.isRequired,
  theme: PropTypes.shape({
    preference: PropTypes.string.isRequired,
    onToggle: PropTypes.func.isRequired,
  }).isRequired,
  onChangeLanguage: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default Shell;
