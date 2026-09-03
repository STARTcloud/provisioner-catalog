import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import About from './About.jsx';
import { resetCatalogCache, setMemberships } from './adapter';
import {
  beginLogin,
  consumeSessionEnded,
  getAccessToken,
  getClaims,
  getUserInfo,
  savePreferences,
  signOut,
} from './auth';
import { useTheme } from './chrome';
import {
  APP_NAME,
  isPushEnabled,
  listenForSubscriptionChange,
  syncSubscription,
} from './chromeProps.jsx';
import { collections, provisioners } from './collections.jsx';
import {
  HomePage,
  ItemPage,
  OrgPage,
  ProviderPage,
  VersionPage,
  formatFileSize,
  isMember,
  pageContextShape,
} from './pages';
import Shell from './shell.jsx';

const ACTIVE_ORG_KEY = 'activeOrganization';
const PREFS_PREFIX = 'catalog_table_prefs';

const resolveActiveOrg = (organizations, stored) => {
  if (stored && organizations.some(org => org.uuid === stored)) {
    return stored;
  }
  return (organizations.find(org => org.primary) || organizations[0])?.uuid || '';
};

const persistTheme = preference => savePreferences({ theme: preference });

const OrgRoute = ({ context, organizations }) => {
  const { org } = useParams();
  return (
    <OrgPage
      collections={collections}
      org={org}
      member={isMember(organizations, org)}
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
  const { i18n } = useTranslation(['common', 'auth']);
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [activeOrgUuid, setActiveOrgUuid] = useState('');
  const [sessionEnded, setSessionEnded] = useState(() => consumeSessionEnded());
  const { preference: themePreference, toggleTheme } = useTheme({ onPersist: persistTheme });

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
    if (!user || !isPushEnabled()) {
      return undefined;
    }
    syncSubscription().catch(() => null);
    return listenForSubscriptionChange(() => null);
  }, [user]);

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

  const context = {
    user,
    orgMark: null,
    prefsPrefix: PREFS_PREFIX,
    appName: APP_NAME,
    formatFileSize,
  };

  return (
    <Shell
      user={user}
      userInfo={userInfo}
      organizations={organizations}
      activeOrgUuid={activeOrgUuid}
      onPickOrg={onPickOrg}
      onSignIn={handleSignIn}
      onSignOut={handleSignOut}
      sessionEnded={Boolean(sessionEnded)}
      theme={{ preference: themePreference, onToggle: toggleTheme }}
      onChangeLanguage={changeLanguage}
    >
      <Routes>
        <Route path="/" element={<HomePage collections={collections} context={context} />} />
        <Route path="/about" element={<About />} />
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
    </Shell>
  );
};

export default App;
