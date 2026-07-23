import axios from 'axios';
import { useEffect, useState } from 'react';
import { Alert, Container, Form, InputGroup, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBuilding, FaGithub, FaGlobe, FaSearch } from 'react-icons/fa';

import { beginLogin, fetchUserInfo, getAccessToken, getClaims, signOut } from './auth';
import CatalogSection from './CatalogCards.jsx';
import UserMenu from './UserMenu.jsx';

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
      fetchUserInfo(token).then(setUserInfo);
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

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setUserInfo(null);
    setOrgResults([]);
  };

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
            <UserMenu
              user={user}
              userInfo={userInfo}
              organizations={user?.organizations || []}
              onSignIn={() => beginLogin()}
              onSignOut={handleSignOut}
            />
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
          <p className="lead">{t('app.heroLead')}</p>
        </Container>
      </section>

      <Container className="py-4">
        <p className="text-body-secondary">
          {t('app.introBefore')}{' '}
          <a href="/catalog.json" className="font-monospace">
            {t('app.introLink')}
          </a>{' '}
          {t('app.introAfter')}
        </p>

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
        {publicCatalog ? (
          <CatalogSection
            title={t('sections.publicTitle')}
            icon={<FaGlobe aria-hidden />}
            subtitle={t('sections.publicSubtitle', { updated: publicCatalog.updated })}
            provisioners={publicCatalog.provisioners}
            health={publicHealth}
            query={query}
            emptyNote={t('sections.publicEmpty')}
          />
        ) : null}

        {!user ? <Alert variant="info">{t('sections.signInPrompt')}</Alert> : null}

        {loadingPrivate ? <Spinner animation="border" role="status" /> : null}

        {orgResults.map(org => (
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
                <Alert variant="secondary">
                  {org.errorKey ? t(org.errorKey) : org.errorMessage}
                </Alert>
              </section>
            )}
          </div>
        ))}
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
