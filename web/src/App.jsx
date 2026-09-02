import axios from 'axios';
import PropTypes from 'prop-types';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Container, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaBuilding,
  FaCircleHalfStroke,
  FaGithub,
  FaGlobe,
  FaMoon,
  FaSun,
  FaTriangleExclamation,
} from 'react-icons/fa6';

import './css/styles.css';
import './css/fonts.css';
import {
  API_ORIGIN,
  authHeaders,
  beginLogin,
  consumeSessionEnded,
  getAccessToken,
  getClaims,
  getUserInfo,
  savePreferences,
  signOut,
  signOutEverywhere,
} from './auth';
import CatalogSection, { filterProvisioners, providerCounts, tierCounts } from './CatalogCards.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import { NavbarSearchControl, NavbarSearchPanel, useNavbarSearchBinding } from './NavbarSearch.jsx';
import { OrgLogo } from './OrgSwitcher.jsx';
import { resyncPushSubscription } from './push';
import UserMenu from './UserMenu.jsx';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const subscribeToColorScheme = onChange => {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const systemPrefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

const THEME_ICONS = { auto: FaCircleHalfStroke, light: FaSun, dark: FaMoon };

const ACTIVE_ORG_KEY = 'activeOrganization';
const PREFS_PREFIX = 'catalog_table_prefs_';

const emptyFilters = () => ({ tiers: new Set(), providers: new Set() });

const readPrefs = key => {
  try {
    const saved = JSON.parse(localStorage.getItem(`${PREFS_PREFIX}${key}`) || 'null');
    return { tiers: new Set(saved?.tiers || []), providers: new Set(saved?.providers || []) };
  } catch {
    return emptyFilters();
  }
};

const writePrefs = (key, filters) => {
  localStorage.setItem(
    `${PREFS_PREFIX}${key}`,
    JSON.stringify({ tiers: [...filters.tiers], providers: [...filters.providers] })
  );
};

const toggleIn = (set, value) => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

const privateErrorKey = requestError => {
  const { status } = requestError.response || {};
  if (status === 404) {
    return 'errors.noPrivateCatalog';
  }
  if (status === 401 || status === 403) {
    return 'errors.accessDenied';
  }
  return '';
};

const resolveActiveOrg = (organizations, stored) => {
  if (stored && organizations.some(org => org.uuid === stored)) {
    return stored;
  }
  return (organizations.find(org => org.primary) || organizations[0])?.uuid || '';
};

const fetchPrivate = async path =>
  axios.get(path, { headers: await authHeaders('GET', `${API_ORIGIN}${path}`) });

const viewData = (view, orgResults, publicCatalog, publicHealth) => {
  if (!view) {
    return { org: null, provisioners: publicCatalog?.provisioners || [], health: publicHealth };
  }
  const org = orgResults.find(entry => entry.uuid === view) || null;
  return { org, provisioners: org?.catalog?.provisioners || [], health: org?.health || null };
};

const hasFilters = (query, filters) =>
  query.trim() !== '' || filters.tiers.size > 0 || filters.providers.size > 0;

const buildGroups = (t, provisioners, health, filters, updateFilters) => [
  {
    key: 'tier',
    label: t('search.tier'),
    entries: tierCounts(provisioners, health),
    activeSet: filters.tiers,
    activeClass: 'bg-primary',
    pillClass: tier => `tier-badge tier-${tier}`,
    labelFor: tier => t(`tiers.${tier}`),
    onToggle: tier =>
      updateFilters(current => ({ ...current, tiers: toggleIn(current.tiers, tier) })),
  },
  {
    key: 'provider',
    label: t('search.provider'),
    entries: providerCounts(provisioners, health),
    activeSet: filters.providers,
    activeClass: 'bg-primary',
    onToggle: provider =>
      updateFilters(current => ({ ...current, providers: toggleIn(current.providers, provider) })),
  },
];

const OrgIcon = ({ org }) =>
  org.logo ? (
    <img
      src={org.logo}
      alt=""
      className="org-logo"
      onError={event => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <FaBuilding aria-hidden />
  );

OrgIcon.propTypes = {
  org: PropTypes.shape({ logo: PropTypes.string }).isRequired,
};

const PublicView = ({ catalog, health, error, provisioners, filtering }) => {
  const { t } = useTranslation();
  return (
    <>
      {error ? (
        <Alert variant="danger">{t('sections.publicLoadFailed', { message: error })}</Alert>
      ) : null}
      {!catalog && !error ? <Spinner animation="border" role="status" /> : null}
      {catalog ? (
        <CatalogSection
          title={t('sections.publicTitle')}
          icon={<FaGlobe aria-hidden />}
          titleTooltip={t('sections.publicSubtitle', { updated: catalog.updated })}
          provisioners={provisioners}
          health={health}
          filtering={filtering}
          emptyNote={t('sections.publicEmpty')}
        />
      ) : null}
    </>
  );
};

PublicView.propTypes = {
  catalog: PropTypes.shape({ updated: PropTypes.string }),
  health: PropTypes.shape({ provisioners: PropTypes.object }),
  error: PropTypes.string.isRequired,
  provisioners: PropTypes.array.isRequired,
  filtering: PropTypes.bool.isRequired,
};

const OrgView = ({ org, loading, provisioners, filtering }) => {
  const { t } = useTranslation();
  if (!org) {
    if (loading) {
      return <Spinner animation="border" role="status" />;
    }
    return <Alert variant="secondary">{t('errors.noPrivateCatalog')}</Alert>;
  }
  if (!org.catalog) {
    return (
      <section className="mb-5">
        <h2 className="h4 d-flex align-items-center gap-2 section-title">
          <OrgIcon org={org} />
          {org.name}
        </h2>
        <Alert variant="secondary">{org.errorKey ? t(org.errorKey) : org.errorMessage}</Alert>
      </section>
    );
  }
  return (
    <CatalogSection
      title={org.name}
      icon={<OrgIcon org={org} />}
      subtitle={t('sections.privateSubtitle', { org: org.name })}
      provisioners={provisioners}
      health={org.health}
      filtering={filtering}
      emptyNote={t('sections.orgEmpty')}
    />
  );
};

OrgView.propTypes = {
  org: PropTypes.shape({
    name: PropTypes.string,
    logo: PropTypes.string,
    catalog: PropTypes.object,
    health: PropTypes.object,
    errorKey: PropTypes.string,
    errorMessage: PropTypes.string,
  }),
  loading: PropTypes.bool.isRequired,
  provisioners: PropTypes.array.isRequired,
  filtering: PropTypes.bool.isRequired,
};

const App = () => {
  const { t, i18n } = useTranslation(['common', 'auth']);
  const [publicCatalog, setPublicCatalog] = useState(null);
  const [publicHealth, setPublicHealth] = useState(null);
  const [publicError, setPublicError] = useState('');
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [orgResults, setOrgResults] = useState([]);
  const [activeOrgUuid, setActiveOrgUuid] = useState('');
  const [view, setView] = useState('');
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(() => consumeSessionEnded());
  const [query, setQuery] = useState('');
  const [filtersByView, setFiltersByView] = useState({});
  const [themePreference, setThemePreference] = useState(
    () => localStorage.getItem('theme') || 'auto'
  );
  const prefersDark = useSyncExternalStore(subscribeToColorScheme, systemPrefersDark);
  const theme = themePreference === 'auto' ? (prefersDark && 'dark') || 'light' : themePreference;

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', themePreference);
  }, [theme, themePreference]);

  useEffect(() => {
    axios
      .get('/catalog.json')
      .then(({ data }) => setPublicCatalog(data))
      .catch(fetchError => setPublicError(fetchError.message));
    axios
      .get('/health.json')
      .then(({ data }) => setPublicHealth(data))
      .catch(() => setPublicHealth(null));
  }, []);

  useEffect(() => {
    const loadPrivate = async () => {
      const token = await getAccessToken();
      if (!token) {
        setSessionEnded(consumeSessionEnded());
        return;
      }
      const claims = getClaims();
      setUser(claims);
      getUserInfo().then(info => {
        setUserInfo(info);
        const preferences = info?.preferences;
        if (['auto', 'light', 'dark'].includes(preferences?.theme)) {
          setThemePreference(preferences.theme);
        }
        if (preferences?.language && preferences.language !== i18n.language) {
          i18n.changeLanguage(preferences.language);
        }
      });
      const organizations = claims?.organizations || [];
      const resolved = resolveActiveOrg(organizations, localStorage.getItem(ACTIVE_ORG_KEY));
      setActiveOrgUuid(resolved);
      if (resolved) {
        localStorage.setItem(ACTIVE_ORG_KEY, resolved);
      } else {
        localStorage.removeItem(ACTIVE_ORG_KEY);
      }
      if (organizations.length === 0) {
        return;
      }
      setLoadingPrivate(true);
      const results = await Promise.all(
        organizations.map(async org => {
          try {
            const [catalogRes, healthRes] = await Promise.all([
              fetchPrivate(`/private/${org.uuid}/catalog.json`),
              fetchPrivate(`/private/${org.uuid}/health.json`).catch(() => null),
            ]);
            return {
              ...org,
              catalog: catalogRes.data,
              health: healthRes?.data || null,
              errorKey: '',
              errorMessage: '',
            };
          } catch (requestError) {
            return {
              ...org,
              catalog: null,
              health: null,
              errorKey: privateErrorKey(requestError),
              errorMessage: requestError.message,
              status: requestError.response?.status,
            };
          }
        })
      );
      if (results.some(result => result.status === 401)) {
        signOut();
        setUser(null);
        setUserInfo(null);
        setSessionEnded(true);
        setLoadingPrivate(false);
        return;
      }
      setOrgResults(results);
      setLoadingPrivate(false);
    };
    loadPrivate();
  }, [i18n]);

  useEffect(() => {
    resyncPushSubscription();
  }, []);

  const viewKey = view || 'home';

  useEffect(() => {
    const current = filtersByView[viewKey];
    if (current) {
      writePrefs(viewKey, current);
    }
  }, [viewKey, filtersByView]);

  const applyThemePreference = preference => {
    setThemePreference(preference);
    savePreferences({ theme: preference });
  };

  const toggleTheme = () => {
    const next =
      (themePreference === 'auto' && 'light') || (themePreference === 'light' && 'dark') || 'auto';
    applyThemePreference(next);
  };

  const ThemeIcon = THEME_ICONS[themePreference] || FaCircleHalfStroke;
  const themeToggleLabel = t(`theme.${themePreference}`);

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setUserInfo(null);
    setOrgResults([]);
    setActiveOrgUuid('');
    setView('');
    localStorage.removeItem(ACTIVE_ORG_KEY);
  };

  const handleSignIn = () => {
    setSessionEnded(false);
    beginLogin();
  };

  const pickOrg = uuid => {
    setActiveOrgUuid(uuid);
    localStorage.setItem(ACTIVE_ORG_KEY, uuid);
    setView(uuid);
    window.scrollTo({ top: 0 });
  };

  const organizations = user?.organizations || [];
  const activeOrg = organizations.find(org => org.uuid === activeOrgUuid) || null;
  const filters = filtersByView[viewKey] || readPrefs(viewKey);

  const updateFilters = updater => {
    setFiltersByView(current => ({
      ...current,
      [viewKey]: updater(current[viewKey] || readPrefs(viewKey)),
    }));
  };

  const shown = viewData(user ? view : '', orgResults, publicCatalog, publicHealth);
  const filtered = filterProvisioners(shown.provisioners, shown.health, query, filters);
  const filtering = hasFilters(query, filters);

  useNavbarSearchBinding({
    query,
    onQueryChange: setQuery,
    placeholder: t('search.placeholder'),
    matched: filtered.length,
    total: shown.provisioners.length,
    groups: buildGroups(t, shown.provisioners, shown.health, filters, updateFilters),
    onClearFilters: () => updateFilters(() => emptyFilters()),
  });

  return (
    <div className="App d-flex flex-column min-vh-100">
      <nav className="navbar navbar-expand-lg sticky-top shadow-sm bg-body-tertiary border-bottom">
        <div className="container-fluid">
          <a
            href="/"
            className="navbar-brand p-0 d-flex align-items-center"
            onClick={event => {
              event.preventDefault();
              setView('');
            }}
          >
            <img src="/startcloud.svg" alt="" className="logo-cluster icon-with-margin-sm" />
            Provisioner Catalog
          </a>
          <ul className="nav nav-pills me-auto">
            {user && activeOrg ? (
              <li className="nav-item">
                <button
                  type="button"
                  className="nav-link py-0 px-2 d-inline-flex align-items-center gap-2 org-pill"
                  onClick={() => setView(activeOrg.uuid)}
                  aria-current={view === activeOrg.uuid ? 'page' : undefined}
                >
                  <OrgLogo org={activeOrg} size={16} className="rounded-circle avatar-sm" />
                  <span>{activeOrg.name}</span>
                </button>
              </li>
            ) : null}
            {!user ? (
              <>
                <li className="nav-item">
                  <a href="https://startcloud.com/#contact" className="nav-link">
                    {t('navbar.contact')}
                  </a>
                </li>
                <li className="nav-item">
                  <a href="/docs/" className="nav-link">
                    {t('navbar.docs')}
                  </a>
                </li>
              </>
            ) : null}
          </ul>

          <ul className="nav nav-pills ms-auto align-items-center">
            <NavbarSearchControl />
            <li className="nav-item">
              <button
                key={themePreference}
                type="button"
                className="btn btn-link nav-link cluster-btn"
                onClick={toggleTheme}
                title={themeToggleLabel}
                aria-label={themeToggleLabel}
              >
                <ThemeIcon />
              </button>
            </li>
            <li className="nav-item">
              <LanguageMenu />
            </li>
            <UserMenu
              user={user}
              userInfo={userInfo}
              organizations={organizations}
              activeOrgUuid={activeOrgUuid}
              onPickOrg={pickOrg}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              onSignOutEverywhere={signOutEverywhere}
            />
          </ul>
        </div>
        <NavbarSearchPanel />
      </nav>

      {sessionEnded && !user ? (
        <div
          className="alert alert-warning d-flex align-items-center gap-3 mx-3 mt-3 mb-0"
          role="alert"
        >
          <FaTriangleExclamation className="flex-shrink-0" />
          <div className="flex-grow-1">
            <strong>{t('sessionEnded.title')}</strong>
            <div className="small">{t('sessionEnded.body')}</div>
          </div>
          <Button variant="primary" size="sm" onClick={handleSignIn}>
            {t('sessionEnded.signIn')}
          </Button>
        </div>
      ) : null}

      <section className="hero">
        <Container>
          <img
            src="https://startcloud.com/assets/images/logos/startCloud-logo-big.svg"
            className="img-fluid"
            alt="STARTcloud logo"
          />
        </Container>
      </section>

      <Container className="py-4 flex-grow-1">
        {view && user ? (
          <OrgView
            org={shown.org}
            loading={loadingPrivate}
            provisioners={filtered}
            filtering={filtering}
          />
        ) : (
          <PublicView
            catalog={publicCatalog}
            health={publicHealth}
            error={publicError}
            provisioners={filtered}
            filtering={filtering}
          />
        )}
      </Container>

      <footer className="footer mt-auto bg-body-tertiary border-top">
        <div className="container-fluid position-relative d-flex align-items-center">
          <div className="footer-edge-start">
            <span className="text-muted">
              Provisioner Catalog &copy; {new Date().getFullYear()}
            </span>
          </div>
          <div className="mx-auto d-flex align-items-center">
            <span className="text-muted me-2">{t('auth:login.poweredBy')}</span>
            <a
              href="https://startcloud.com"
              target="_blank"
              rel="noreferrer"
              className="text-decoration-none d-flex align-items-center"
            >
              <img
                src="/startcloud-logo40.png"
                alt="STARTcloud"
                height="20"
                className="me-2"
                onError={event => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <span className="text-muted">{t('auth:login.poweredByCompany')}</span>
            </a>
          </div>
          <div className="footer-edge-end d-flex align-items-center">
            <a
              href="https://github.com/STARTcloud/provisioner-catalog"
              target="_blank"
              rel="noreferrer"
              className="text-decoration-none text-body-secondary"
            >
              <FaGithub className="me-1" />
              Provisioner Catalog v{__APP_VERSION__}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
