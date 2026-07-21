import axios from 'axios';
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  ListGroup,
  Navbar,
  Row,
  Spinner,
} from 'react-bootstrap';
import { FaBuilding, FaGithub, FaGlobe } from 'react-icons/fa';

import { beginLogin, getAccessToken, getClaims, signOut } from './auth';

const provisionerShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  repo: PropTypes.string.isRequired,
  description: PropTypes.string,
  versions: PropTypes.arrayOf(
    PropTypes.shape({
      version: PropTypes.string.isRequired,
      artifacts: PropTypes.arrayOf(
        PropTypes.shape({
          url: PropTypes.string.isRequired,
          checksum_type: PropTypes.string.isRequired,
          checksum: PropTypes.string.isRequired,
        })
      ).isRequired,
    })
  ).isRequired,
});

const ProvisionerCard = ({ provisioner }) => {
  const [latest] = provisioner.versions;
  return (
    <Card className="h-100 shadow-sm">
      <Card.Body>
        <Card.Title className="d-flex justify-content-between align-items-start gap-2">
          <span className="text-break">{provisioner.name}</span>
          <Badge bg="primary">v{latest.version}</Badge>
        </Card.Title>
        <Card.Subtitle className="mb-2">
          <a
            className="text-decoration-none"
            href={`https://github.com/${provisioner.repo}`}
            target="_blank"
            rel="noreferrer"
          >
            <FaGithub className="me-1" />
            {provisioner.repo}
          </a>
        </Card.Subtitle>
        <Card.Text>{provisioner.description || 'No description provided.'}</Card.Text>
        <Accordion flush>
          <Accordion.Item eventKey="versions">
            <Accordion.Header>
              {provisioner.versions.length}
              {provisioner.versions.length === 1 ? ' version' : ' versions'}
            </Accordion.Header>
            <Accordion.Body className="p-0">
              <ListGroup variant="flush">
                {provisioner.versions.map(entry => (
                  <ListGroup.Item key={entry.version}>
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <strong>{entry.version}</strong>
                      <span>
                        {entry.artifacts.map(artifact => (
                          <a key={artifact.url} href={artifact.url}>
                            download
                          </a>
                        ))}
                      </span>
                    </div>
                    {entry.artifacts.map(artifact => (
                      <code key={artifact.checksum} className="checksum d-block text-break">
                        {artifact.checksum_type}:{artifact.checksum}
                      </code>
                    ))}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Card.Body>
    </Card>
  );
};

ProvisionerCard.propTypes = {
  provisioner: provisionerShape.isRequired,
};

const CatalogSection = ({
  title,
  icon = null,
  subtitle = '',
  provisioners,
  emptyNote = 'Nothing published yet.',
}) => (
  <section className="mb-5">
    <h2 className="h4 d-flex align-items-center gap-2">
      {icon}
      {title}
    </h2>
    {subtitle ? <p className="text-body-secondary mb-3">{subtitle}</p> : null}
    {provisioners.length === 0 ? (
      <Alert variant="light">{emptyNote}</Alert>
    ) : (
      <Row xs={1} md={2} xl={3} className="g-3">
        {provisioners.map(provisioner => (
          <Col key={provisioner.name}>
            <ProvisionerCard provisioner={provisioner} />
          </Col>
        ))}
      </Row>
    )}
  </section>
);

CatalogSection.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.node,
  subtitle: PropTypes.string,
  provisioners: PropTypes.arrayOf(provisionerShape).isRequired,
  emptyNote: PropTypes.string,
};

const privateErrorMessage = requestError => {
  const { status } = requestError.response || {};
  if (status === 404) {
    return 'No private catalog published for this organization yet.';
  }
  if (status === 401 || status === 403) {
    return 'Access denied by the catalog gate.';
  }
  return requestError.message;
};

const App = () => {
  const [publicCatalog, setPublicCatalog] = useState(null);
  const [publicError, setPublicError] = useState('');
  const [user, setUser] = useState(null);
  const [orgResults, setOrgResults] = useState([]);
  const [loadingPrivate, setLoadingPrivate] = useState(false);

  useEffect(() => {
    axios
      .get('/catalog.json')
      .then(({ data }) => setPublicCatalog(data))
      .catch(fetchError => setPublicError(fetchError.message));
  }, []);

  useEffect(() => {
    const loadPrivate = async () => {
      const token = await getAccessToken();
      if (!token) {
        return;
      }
      const claims = getClaims();
      setUser(claims);
      const organizations = claims?.organizations || [];
      if (organizations.length === 0) {
        return;
      }
      setLoadingPrivate(true);
      const results = await Promise.all(
        organizations.map(async org => {
          try {
            const { data } = await axios.get(`/private/${org.uuid}/catalog.json`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return { ...org, catalog: data, error: '' };
          } catch (requestError) {
            return { ...org, catalog: null, error: privateErrorMessage(requestError) };
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
    setOrgResults([]);
  };

  return (
    <>
      <Navbar bg="dark" data-bs-theme="dark" sticky="top" className="shadow-sm">
        <Container>
          <Navbar.Brand>STARTcloud Provisioner Catalog</Navbar.Brand>
          <div className="d-flex align-items-center gap-2">
            {user ? (
              <>
                <span className="navbar-text">{user.name || user.email || 'Signed in'}</span>
                <Button variant="outline-light" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button variant="light" size="sm" onClick={() => beginLogin()}>
                Sign in
              </Button>
            )}
          </div>
        </Container>
      </Navbar>

      <Container className="py-4">
        <p className="text-body-secondary">
          Provisioner packages consumed by hyperweaver-agent and zoneweaver-agent. Agents fetch{' '}
          <a href="/catalog.json">
            <code>catalog.json</code>
          </a>{' '}
          directly — this page is a human view of the same data. Sign in to also see your
          organizations&rsquo; private provisioners.
        </p>

        {publicError ? (
          <Alert variant="danger">Could not load the public catalog: {publicError}</Alert>
        ) : null}
        {!publicCatalog && !publicError ? <Spinner animation="border" role="status" /> : null}
        {publicCatalog ? (
          <CatalogSection
            title="Public catalog"
            icon={<FaGlobe aria-hidden />}
            subtitle={`Updated ${publicCatalog.updated} — regenerates every ~2 hours from admitted repositories.`}
            provisioners={publicCatalog.provisioners}
            emptyNote="The public catalog is empty."
          />
        ) : null}

        {!user ? (
          <Alert variant="info">
            Sign in with your STARTcloud account to see the private provisioners your organizations
            publish.
          </Alert>
        ) : null}

        {loadingPrivate ? <Spinner animation="border" role="status" /> : null}

        {orgResults.map(org => (
          <div key={org.uuid}>
            {org.catalog ? (
              <CatalogSection
                title={org.name}
                icon={<FaBuilding aria-hidden />}
                subtitle={`Private catalog — visible to ${org.name} members only.`}
                provisioners={org.catalog.provisioners}
                emptyNote="This organization has no published provisioners yet."
              />
            ) : (
              <section className="mb-5">
                <h2 className="h4 d-flex align-items-center gap-2">
                  <FaBuilding aria-hidden />
                  {org.name}
                </h2>
                <Alert variant="secondary">{org.error}</Alert>
              </section>
            )}
          </div>
        ))}
      </Container>

      <footer className="border-top py-3">
        <Container className="d-flex flex-wrap gap-2 justify-content-between text-body-secondary">
          <a
            className="text-decoration-none"
            href="https://github.com/STARTcloud/provisioner-catalog"
          >
            <FaGithub className="me-1" />
            Source on GitHub
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
