import axios from 'axios';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Container, Form, InputGroup, Spinner, Tab, Tabs } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaBuilding,
  FaCircleHalfStroke,
  FaGithub,
  FaGlobe,
  FaMagnifyingGlass,
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
import CatalogSection from './CatalogCards.jsx';
import LanguageMenu from './LanguageMenu.jsx';
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

const defaultOrgUuid = organizations =>
  (organizations.find(org => org.primary) || organizations[0])?.uuid || '';

const fetchPrivate = async path =>
  axios.get(path, { headers: await authHeaders('GET', `${API_ORIGIN}${path}`) });

const App = () => {
  const { t, i18n } = useTranslation(['common', 'auth']);
  const [publicCatalog, setPublicCatalog] = useState(null);
  const [publicHealth, setPublicHealth] = useState(null);
  const [publicError, setPublicError] = useState('');
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [orgResults, setOrgResults] = useState([]);
  const [activeOrgUuid, setActiveOrgUuid] = useState('');
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(() => consumeSessionEnded());
  const [query, setQuery] = useState('');
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
      setActiveOrgUuid(defaultOrgUuid(organizations));
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
  };

  const handleSignIn = () => {
    setSessionEnded(false);
    beginLogin();
  };

  const pickOrg = uuid => {
    setActiveOrgUuid(uuid);
    document.getElementById(`org-${uuid}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  const updatedTooltip = publicCatalog
    ? t('sections.publicSubtitle', { updated: publicCatalog.updated })
    : '';

  const publicTabTitle = (
    <span className="d-inline-flex align-items-center gap-2" title={updatedTooltip || undefined}>
      <FaGlobe aria-hidden />
      {t('sections.publicTitle')}
    </span>
  );

  const privateTabTitle = (
    <span className="d-inline-flex align-items-center gap-2">
      <FaBuilding aria-hidden />
      {t('sections.privateTitle')}
    </span>
  );

  const orgIcon = org =>
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

  const visibleOrgs = orgResults.filter(org => org.errorKey !== 'errors.noPrivateCatalog');

  const orgSections = visibleOrgs.map(org => (
    <div key={org.uuid} id={`org-${org.uuid}`} className="section-anchor">
      {org.catalog ? (
        <CatalogSection
          title={org.name}
          icon={orgIcon(org)}
          subtitle={t('sections.privateSubtitle', { org: org.name })}
          provisioners={org.catalog.provisioners}
          health={org.health}
          query={query}
          emptyNote={t('sections.orgEmpty')}
        />
      ) : (
        <section className="mb-5">
          <h2 className="h4 d-flex align-items-center gap-2 section-title">
            {orgIcon(org)}
            {org.name}
          </h2>
          <Alert variant="secondary">{org.errorKey ? t(org.errorKey) : org.errorMessage}</Alert>
        </section>
      )}
    </div>
  ));

  return (
    <div className="App d-flex flex-column min-vh-100">
      <nav className="navbar navbar-expand-lg sticky-top shadow-sm bg-body-tertiary border-bottom">
        <div className="container-fluid">
          <a href="/" className="navbar-brand p-0 d-flex align-items-center">
            <img src="/startcloud.svg" alt="" className="logo-cluster icon-with-margin-sm" />
            Provisioner Catalog
          </a>
          <ul className="nav nav-pills me-auto">
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
              organizations={user?.organizations || []}
              activeOrgUuid={activeOrgUuid}
              onPickOrg={pickOrg}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              onSignOutEverywhere={signOutEverywhere}
            />
          </ul>
        </div>
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
        <InputGroup className="mb-4 catalog-search">
          <InputGroup.Text>
            <FaMagnifyingGlass aria-hidden />
          </InputGroup.Text>
          <Form.Control
            type="search"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label={t('search.aria')}
          />
        </InputGroup>

        {publicError ? (
          <Alert variant="danger">{t('sections.publicLoadFailed', { message: publicError })}</Alert>
        ) : null}
        {!publicCatalog && !publicError ? <Spinner animation="border" role="status" /> : null}
        {publicCatalog && visibleOrgs.length === 0 ? (
          <CatalogSection
            title={t('sections.publicTitle')}
            icon={<FaGlobe aria-hidden />}
            titleTooltip={updatedTooltip}
            provisioners={publicCatalog.provisioners}
            health={publicHealth}
            query={query}
            emptyNote={t('sections.publicEmpty')}
          />
        ) : null}

        {visibleOrgs.length > 0 ? (
          <Tabs defaultActiveKey="public" className="mb-4 catalog-tabs">
            <Tab eventKey="public" title={publicTabTitle}>
              {publicCatalog ? (
                <CatalogSection
                  provisioners={publicCatalog.provisioners}
                  health={publicHealth}
                  query={query}
                  emptyNote={t('sections.publicEmpty')}
                />
              ) : null}
            </Tab>
            <Tab eventKey="private" title={privateTabTitle}>
              {orgSections}
            </Tab>
          </Tabs>
        ) : null}

        {loadingPrivate ? <Spinner animation="border" role="status" /> : null}
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
