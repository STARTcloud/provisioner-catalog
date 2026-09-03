import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import About from './About.jsx';
import { resetCatalogCache, setMemberships } from './adapter';
import { useTheme } from './chrome';
import { ACTIVE_ORG_KEY, APP_NAME, events, push, returnTo, session } from './chromeProps.jsx';
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
import { useSession } from './session';
import Shell from './shell.jsx';

const PREFS_PREFIX = 'catalog_table_prefs';

const persistTheme = preference => session.savePreferences({ theme: preference });

const adoptMemberships = next => setMemberships(next?.organizations || []);

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
  const account = useSession({
    provider: session,
    events,
    returnTo,
    activeOrgKey: ACTIVE_ORG_KEY,
    push,
    onAdopt: adoptMemberships,
  });
  const { user, organizations } = account;
  const { preference: themePreference, toggleTheme } = useTheme({ onPersist: persistTheme });

  const handleSignOut = () => {
    account.signOut();
    resetCatalogCache();
    navigate('/');
  };

  const changeLanguage = async lang => {
    await i18n.changeLanguage(lang);
    session.savePreferences({ language: lang });
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
      account={account}
      onSignOut={handleSignOut}
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
