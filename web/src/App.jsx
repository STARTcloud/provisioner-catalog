import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { Container, Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBook, FaEnvelope } from 'react-icons/fa6';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import {
  ISSUER,
  beginLogin,
  consumeSessionEnded,
  getAccessToken,
  getClaims,
  getUserInfo,
  savePreferences,
  signOut,
  signOutEverywhere,
} from './auth';
import { resetCatalogCache, setMemberships } from './catalogAdapter';
import { Footer, Header, OrgLogo, buildRouteCrumbs, parseRoute, useTheme } from './chrome';
import {
  APP_NAME,
  Avatar,
  POWERED_BY,
  REPO_URL,
  VIEW_ALL_URL,
  buildTicketUrl,
  fetchHealth,
  notificationsAdapter,
  pushAdapter,
} from './chromeProps.jsx';
import { collections, provisioners } from './collections.jsx';
import { getSupportedLanguages } from './i18n';
import { HomePage, ItemPage, OrgPage, ProviderPage, VersionPage, pageContextShape } from './pages';
import { resyncPushSubscription } from './push';
import RebuildItem from './RebuildItem.jsx';

const ACTIVE_ORG_KEY = 'activeOrganization';
const RESERVED_ROUTES = ['callback', 'docs', 'schema', 'private', 'push', 'admin'];
const PREFS_PREFIX = 'catalog_table_prefs';

const resolveActiveOrg = (organizations, stored) => {
  if (stored && organizations.some(org => org.uuid === stored)) {
    return stored;
  }
  return (organizations.find(org => org.primary) || organizations[0])?.uuid || '';
};

const persistTheme = preference => savePreferences({ theme: preference });

const formatFileSize = bytes => {
  const size = Number(bytes) || 0;
  if (size === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(size) / Math.log(k));
  return `${parseFloat((size / k ** i).toFixed(2))} ${sizes[i]}`;
};

const AppRows = ({ isAdmin }) => {
  const { t } = useTranslation();
  return (
    <>
      {isAdmin ? <RebuildItem /> : null}
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

const buildUserMenu = ({
  t,
  user,
  userInfo,
  organizations,
  activeOrgUuid,
  onPickOrg,
  onSignOut,
}) => {
  const displayName = userInfo?.name || user.name || user.email || t('user.unknownUser');
  const picture = userInfo?.picture || '';
  const activeOrg = organizations.find(org => org.uuid === activeOrgUuid) || null;
  return {
    displayName,
    email: user.email && user.email !== displayName ? user.email : '',
    renderAvatar: size => <Avatar picture={picture} size={size} />,
    oidc: true,
    issuerUrl: ISSUER,
    localProfile: null,
    organizations,
    activeOrgUuid,
    onPickOrg,
    loadOrganizations: null,
    orgMark: null,
    favorites: userInfo?.favorite_apps || [],
    appName: t('navbar.provisionerCatalog'),
    appRows: <AppRows isAdmin={Boolean(user.authorities?.includes('ROLE_ADMIN'))} />,
    notifications: String(user.scope || '').includes('notifications') ? notificationsAdapter : null,
    push: pushAdapter,
    viewAllUrl: VIEW_ALL_URL,
    ticketUrl: buildTicketUrl(user, userInfo, activeOrg),
    onSignOut,
    onSignOutEverywhere: signOutEverywhere,
  };
};

const OrgRoute = ({ context, organizations }) => {
  const { org } = useParams();
  return (
    <OrgPage
      collections={collections}
      org={org}
      member={organizations.some(entry => entry.name === org)}
      context={context}
    />
  );
};

OrgRoute.propTypes = {
  context: pageContextShape.isRequired,
  organizations: PropTypes.array.isRequired,
};

const ItemRoute = ({ context }) => {
  const { org, name } = useParams();
  return <ItemPage collection={provisioners} org={org} name={name} context={context} />;
};

ItemRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const VersionRoute = ({ context }) => {
  const { org, name, version } = useParams();
  return (
    <VersionPage
      collection={provisioners}
      org={org}
      name={name}
      version={version}
      context={context}
    />
  );
};

VersionRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const ProviderRoute = ({ context }) => {
  const { org, name, version, provider } = useParams();
  return (
    <ProviderPage
      collection={provisioners}
      org={org}
      name={name}
      version={version}
      provider={provider}
      context={context}
    />
  );
};

ProviderRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const App = () => {
  const { t, i18n } = useTranslation(['common', 'auth']);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [activeOrgUuid, setActiveOrgUuid] = useState('');
  const [sessionEnded, setSessionEnded] = useState(() => consumeSessionEnded());
  const { preference: themePreference, toggleTheme } = useTheme({ onPersist: persistTheme });
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    const loadSession = async () => {
      const token = await getAccessToken();
      if (!token) {
        setSessionEnded(consumeSessionEnded());
        return;
      }
      const claims = getClaims();
      const organizations = claims?.organizations || [];
      setMemberships(organizations);
      setUser(claims);
      getUserInfo().then(info => setUserInfo(info));
      const resolved = resolveActiveOrg(organizations, localStorage.getItem(ACTIVE_ORG_KEY));
      setActiveOrgUuid(resolved);
      if (resolved) {
        localStorage.setItem(ACTIVE_ORG_KEY, resolved);
      } else {
        localStorage.removeItem(ACTIVE_ORG_KEY);
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    resyncPushSubscription();
  }, []);

  const organizations = user?.organizations || [];

  const handleSignOut = () => {
    signOut();
    resetCatalogCache();
    setMemberships([]);
    setUser(null);
    setUserInfo(null);
    setActiveOrgUuid('');
    localStorage.removeItem(ACTIVE_ORG_KEY);
    navigate('/');
  };

  const handleSignIn = () => {
    setSessionEnded(false);
    beginLogin();
  };

  const changeLanguage = async lang => {
    await i18n.changeLanguage(lang);
    savePreferences({ language: lang });
  };

  const onPickOrg = uuid => {
    const org = organizations.find(entry => entry.uuid === uuid);
    if (!org) {
      return;
    }
    setActiveOrgUuid(uuid);
    localStorage.setItem(ACTIVE_ORG_KEY, uuid);
  };

  const route = parseRoute(pathname, { reserved: RESERVED_ROUTES, collections });
  const routeOrg = route?.org ? organizations.find(entry => entry.name === route.org) : null;
  const orgIcon = (
    <OrgLogo
      org={routeOrg || { logo: route?.org ? `https://github.com/${route.org}.png?size=32` : '' }}
      size={16}
      className="rounded-circle avatar-sm"
    />
  );

  const context = {
    user,
    orgMark: null,
    prefsPrefix: PREFS_PREFIX,
    appName: APP_NAME,
    formatFileSize,
  };

  const userMenu = user
    ? buildUserMenu({
        t,
        user,
        userInfo,
        organizations,
        activeOrgUuid,
        onPickOrg,
        onSignOut: handleSignOut,
      })
    : null;

  return (
    <div className="App d-flex flex-column vh-100">
      <Header
        brand={{
          name: APP_NAME,
          logo: <img src="/startcloud.svg" alt="" className="logo-cluster icon-with-margin-sm" />,
          to: '/',
        }}
        links={[
          { key: 'contact', label: t('navbar.contact'), href: 'https://startcloud.com/#contact' },
          { key: 'docs', label: t('navbar.docs'), href: '/docs/' },
        ]}
        crumbs={user ? buildRouteCrumbs({ route, t, orgIcon }) : []}
        LinkComponent={Link}
        theme={{ preference: themePreference, onToggle: toggleTheme }}
        language={{ languages: getSupportedLanguages(), onPick: changeLanguage }}
        signedIn={Boolean(user)}
        onSignIn={handleSignIn}
        userMenu={userMenu}
        sessionEnded={Boolean(sessionEnded && !user)}
      />

      <Container fluid ref={scrollRef} className="app-scroll py-3">
        <Routes>
          <Route path="/" element={<HomePage collections={collections} context={context} />} />
          <Route
            path="/:org"
            element={<OrgRoute context={context} organizations={organizations} />}
          />
          <Route path="/:org/:name" element={<ItemRoute context={context} />} />
          <Route path="/:org/:name/:version" element={<VersionRoute context={context} />} />
          <Route
            path="/:org/:name/:version/:provider"
            element={<ProviderRoute context={context} />}
          />
        </Routes>
      </Container>

      <Footer
        appName={APP_NAME}
        version={__APP_VERSION__}
        repoUrl={REPO_URL}
        poweredBy={POWERED_BY}
        fetchHealth={fetchHealth}
      />
    </div>
  );
};

export default App;
