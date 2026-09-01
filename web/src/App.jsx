import axios from 'axios';
import { useEffect, useState } from 'react';
import { Alert, Button, Container, Form, InputGroup, Spinner, Tab, Tabs } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaAdjust,
  FaBuilding,
  FaExclamationTriangle,
  FaGithub,
  FaGlobe,
  FaMoon,
  FaSearch,
  FaSun,
} from 'react-icons/fa';

import {
  API_ORIGIN,
  authHeaders,
  beginLogin,
  consumeSessionEnded,
  getAccessToken,
  getClaims,
  getUserInfo,
  signOut,
  signOutEverywhere,
} from './auth';
import CatalogSection from './CatalogCards.jsx';
import { useTheme } from './contexts/ThemeContext.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import { resyncPushSubscription } from './push';
import UserMenu from './UserMenu.jsx';

const THEME_ICONS = { auto: FaAdjust, light: FaSun, dark: FaMoon };

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
  const { t } = useTranslation();
  const { theme, toggleTheme, getThemeDisplay } = useTheme();
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
      getUserInfo().then(setUserInfo);
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
  }, []);

  useEffect(() => {
    resyncPushSubscription();
  }, []);

  const ThemeIcon = THEME_ICONS[theme] || FaAdjust;
  const themeLabel = `${t('header.theme')}: ${getThemeDisplay()}`;

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
    <>
      <header className="sticky-top sc-header shadow-sm">
        <div className="d-flex flex-wrap align-items-center justify-content-center justify-content-lg-start">
          <a
            className="navbar-brand p-0 me-0 me-lg-2"
            href="https://startcloud.com/"
            aria-label="STARTcloud"
          >
            <img src="/startcloud.svg" width="34" height="34" alt="" />
          </a>
          <ul className="nav col-12 col-lg-auto me-lg-auto mb-2 justify-content-center mb-md-0">
            <li>
              <span className="nav-link px-2 fw-semibold">{t('header.brand')}</span>
            </li>
            {!user ? (
              <>
                <li>
                  <a href="https://startcloud.com/#contact" className="nav-link px-2">
                    {t('header.contact')}
                  </a>
                </li>
                <li>
                  <a href="/docs/" className="nav-link px-2">
                    {t('header.docs')}
                  </a>
                </li>
              </>
            ) : null}
          </ul>
          <div className="d-flex align-items-center gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              className="header-icon-btn"
              onClick={toggleTheme}
              title={themeLabel}
              aria-label={themeLabel}
            >
              <ThemeIcon aria-hidden />
            </Button>
            <LanguageMenu />
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
          </div>
        </div>
      </header>

      {sessionEnded && !user ? (
        <Container className="pt-3">
          <Alert
            variant="warning"
            dismissible
            onClose={() => setSessionEnded(false)}
            className="d-flex align-items-center gap-3 mb-0"
          >
            <FaExclamationTriangle className="flex-shrink-0" aria-hidden />
            <span className="flex-grow-1">
              <strong className="d-block">{t('session.endedTitle')}</strong>
              <span className="small">{t('session.endedBody')}</span>
            </span>
            <Button variant="primary" size="sm" onClick={handleSignIn}>
              {t('header.signIn')}
            </Button>
          </Alert>
        </Container>
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

      <Container className="py-4">
        <InputGroup className="mb-4 catalog-search">
          <InputGroup.Text>
            <FaSearch aria-hidden />
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

      <footer className="footer mt-auto sc-footer bg-body-tertiary border-top">
        <div className="position-relative d-flex align-items-center">
          <div className="position-absolute start-0">
            <span className="text-muted">
              {t('header.brand')} &copy; {new Date().getFullYear()}
            </span>
          </div>
          <div className="mx-auto d-flex align-items-center">
            <span className="text-muted me-2">{t('footer.poweredBy')}</span>
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
              <span className="text-muted">{t('footer.poweredByCompany')}</span>
            </a>
          </div>
          <div className="position-absolute end-0">
            <a
              className="text-decoration-none text-body-secondary"
              href="https://github.com/STARTcloud/provisioner-catalog"
            >
              <FaGithub className="me-1" />
              {__APP_NAME__} v{__APP_VERSION__}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
};

export default App;
