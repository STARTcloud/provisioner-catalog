import axios from 'axios';
import { useEffect, useState } from 'react';
import { Alert, Button, Container, Form, InputGroup, Spinner, Tab, Tabs } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaAdjust, FaBuilding, FaGithub, FaGlobe, FaMoon, FaSearch, FaSun } from 'react-icons/fa';

import { beginLogin, getAccessToken, getClaims, getUserInfo, signOut } from './auth';
import CatalogSection from './CatalogCards.jsx';
import { useTheme } from './contexts/ThemeContext.jsx';
import NotificationBell from './NotificationBell.jsx';
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

const App = () => {
  const { t } = useTranslation();
  const { theme, toggleTheme, getThemeDisplay } = useTheme();
  const [publicCatalog, setPublicCatalog] = useState(null);
  const [publicHealth, setPublicHealth] = useState(null);
  const [publicError, setPublicError] = useState('');
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [orgResults, setOrgResults] = useState([]);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
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
        return;
      }
      const claims = getClaims();
      setUser(claims);
      getUserInfo().then(setUserInfo);
      const organizations = claims?.organizations || [];
      if (organizations.length === 0) {
        return;
      }
      setLoadingPrivate(true);
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const results = await Promise.all(
        organizations.map(async org => {
          try {
            const [catalogRes, healthRes] = await Promise.all([
              axios.get(`/private/${org.uuid}/catalog.json`, auth),
              axios.get(`/private/${org.uuid}/health.json`, auth).catch(() => null),
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
            };
          }
        })
      );
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

  const orgSections = orgResults.map(org => (
    <div key={org.uuid} id={`org-${org.uuid}`} className="section-anchor">
      {org.catalog ? (
        <CatalogSection
          title={org.name}
          icon={<FaBuilding aria-hidden />}
          subtitle={t('sections.privateSubtitle', { org: org.name })}
          provisioners={org.catalog.provisioners}
          health={org.health}
          query={query}
          emptyNote={t('sections.orgEmpty')}
        />
      ) : (
        <section className="mb-5">
          <h2 className="h4 d-flex align-items-center gap-2 section-title">
            <FaBuilding aria-hidden />
            {org.name}
          </h2>
          <Alert variant="secondary">{org.errorKey ? t(org.errorKey) : org.errorMessage}</Alert>
        </section>
      )}
    </div>
  ));

  return (
    <>
      <header className="p-3 sticky-top sc-header shadow-sm">
        <Container>
          <div className="d-flex flex-wrap align-items-center justify-content-center justify-content-lg-start">
            <a
              className="navbar-brand p-0 me-0 me-lg-2"
              href="https://startcloud.com/"
              aria-label="STARTcloud"
            >
              <img src="/startcloud.svg" width="40" height="40" alt="" />
            </a>
            <ul className="nav col-12 col-lg-auto me-lg-auto mb-2 justify-content-center mb-md-0">
              <li>
                <span className="nav-link px-2 fw-semibold">{t('header.brand')}</span>
              </li>
              <li>
                <a href="https://startcloud.com/" className="nav-link px-2">
                  {t('header.startcloud')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/STARTcloud/provisioner-catalog"
                  className="nav-link px-2"
                >
                  {t('header.github')}
                </a>
              </li>
              <li>
                <a href="https://startcloud.com/#contact" className="nav-link px-2">
                  {t('header.contact')}
                </a>
              </li>
            </ul>
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={toggleTheme}
                title={themeLabel}
                aria-label={themeLabel}
              >
                <ThemeIcon aria-hidden />
              </Button>
              <NotificationBell user={user} />
              <UserMenu
                user={user}
                userInfo={userInfo}
                organizations={user?.organizations || []}
                onSignIn={() => beginLogin()}
                onSignOut={handleSignOut}
              />
            </div>
          </div>
        </Container>
      </header>

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
        {publicCatalog && orgResults.length === 0 ? (
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

        {orgResults.length > 0 ? (
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

      <footer className="border-top py-3">
        <Container className="text-center">
          <span>{t('footer.copyright')}</span>
        </Container>
        <Container className="mt-2 d-flex flex-wrap gap-3 justify-content-center text-body-secondary small">
          <a
            className="text-decoration-none"
            href="https://github.com/STARTcloud/provisioner-catalog"
          >
            <FaGithub className="me-1" />
            {t('footer.source')}
          </a>
          <span>
            {__APP_NAME__} v{__APP_VERSION__}
          </span>
        </Container>
      </footer>
    </>
  );
};

export default App;
