import PropTypes from 'prop-types';
import { useState } from 'react';
import { Accordion, Alert, Badge, Button, Card, Col, ListGroup, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBug, FaCube, FaGithub, FaHome } from 'react-icons/fa';

const VISIBLE_VERSIONS = 10;

export const provisionerShape = PropTypes.shape({
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

export const healthEntryShape = PropTypes.shape({
  tier: PropTypes.string.isRequired,
  presentation: PropTypes.shape({
    label: PropTypes.string,
    icon: PropTypes.string,
    homepage: PropTypes.string,
  }),
  failed_rules: PropTypes.arrayOf(PropTypes.string).isRequired,
  health: PropTypes.shape({
    latest_version: PropTypes.string,
    latest_release_at: PropTypes.string,
    artifacts_ok: PropTypes.bool.isRequired,
    sidecars_ok: PropTypes.bool.isRequired,
    providers: PropTypes.arrayOf(PropTypes.string),
    downloads: PropTypes.number,
  }).isRequired,
});

const TierBadge = ({ entry }) => {
  const { t } = useTranslation();
  if (!entry) {
    return null;
  }
  return (
    <Badge className={`tier-badge tier-${entry.tier}`} title={t('card.tierTooltip')}>
      {t(`tiers.${entry.tier}`)}
    </Badge>
  );
};

TierBadge.propTypes = {
  entry: healthEntryShape,
};

const staleDaysOf = entry => {
  const releasedAt = entry?.health?.latest_release_at;
  if (!releasedAt) {
    return null;
  }
  return Math.floor((Date.now() - new Date(releasedAt).getTime()) / 86400000);
};

const HealthChips = ({ entry }) => {
  const { t } = useTranslation();
  if (!entry) {
    return null;
  }
  const chips = [];
  const staleDays = staleDaysOf(entry);
  if (staleDays !== null && staleDays > 365) {
    chips.push({ key: 'stale', bg: 'warning', text: t('health.stale', { count: staleDays }) });
  }
  if (!entry.health.artifacts_ok) {
    chips.push({ key: 'artifacts', bg: 'danger', text: t('health.artifactErrors') });
  }
  if (!entry.health.sidecars_ok) {
    chips.push({ key: 'sidecars', bg: 'warning', text: t('health.sidecarGaps') });
  }
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="d-flex flex-wrap gap-1 mb-2">
      {chips.map(chip => (
        <Badge key={chip.key} bg={chip.bg} text={chip.bg === 'warning' ? 'dark' : undefined}>
          {chip.text}
        </Badge>
      ))}
    </div>
  );
};

HealthChips.propTypes = {
  entry: healthEntryShape,
};

const CardMeta = ({ entry }) => {
  const { t } = useTranslation();
  if (!entry) {
    return null;
  }
  const { downloads } = entry.health;
  const releasedDays = staleDaysOf(entry);
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-2 small text-body-secondary">
      {releasedDays !== null ? <span>{t('card.released', { count: releasedDays })}</span> : null}
      {typeof downloads === 'number' ? (
        <span>{t('card.downloads', { count: downloads })}</span>
      ) : null}
    </div>
  );
};

CardMeta.propTypes = {
  entry: healthEntryShape,
};

const ProviderChips = ({ entry }) => {
  if (!entry) {
    return null;
  }
  const { providers = [] } = entry.health;
  if (providers.length === 0) {
    return null;
  }
  return (
    <div className="d-flex flex-wrap gap-1 mb-2">
      {providers.map(provider => (
        <Badge key={provider} bg="secondary">
          {provider}
        </Badge>
      ))}
    </div>
  );
};

ProviderChips.propTypes = {
  entry: healthEntryShape,
};

const QualityBreakdown = ({ entry }) => {
  const { t } = useTranslation();
  if (!entry) {
    return null;
  }
  return (
    <Accordion.Item eventKey="quality">
      <Accordion.Header>{t('card.quality', { tier: t(`tiers.${entry.tier}`) })}</Accordion.Header>
      <Accordion.Body>
        {entry.failed_rules.length === 0 ? (
          <p className="mb-0">{t('card.allRulesPass')}</p>
        ) : (
          <>
            <p className="mb-1">{t('card.unmetRules')}</p>
            <ul className="mb-0">
              {entry.failed_rules.map(rule => (
                <li key={rule}>
                  <code>{rule}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </Accordion.Body>
    </Accordion.Item>
  );
};

QualityBreakdown.propTypes = {
  entry: healthEntryShape,
};

const ProvisionerIcon = ({ entry }) => {
  const icon = entry?.presentation?.icon;
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className="prov-icon"
        loading="lazy"
        onError={event => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return <FaCube className="prov-icon prov-icon-fallback" aria-hidden />;
};

ProvisionerIcon.propTypes = {
  entry: healthEntryShape,
};

const ProvisionerCard = ({ provisioner, healthEntry = null }) => {
  const { t } = useTranslation();
  const [latest] = provisioner.versions;
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [owner, repoName] = provisioner.repo.split('/');
  const label = healthEntry?.presentation?.label || '';
  const homepage = healthEntry?.presentation?.homepage || '';
  const versions = showAllVersions
    ? provisioner.versions
    : provisioner.versions.slice(0, VISIBLE_VERSIONS);
  const hiddenCount = provisioner.versions.length - versions.length;
  return (
    <Card className="h-100 shadow-sm catalog-card">
      <Card.Body className="d-flex flex-column">
        <div className="d-flex align-items-start gap-2 mb-2">
          <ProvisionerIcon entry={healthEntry} />
          <div className="flex-grow-1 min-width-0">
            <Card.Title className="mb-0 text-break">{label || provisioner.name}</Card.Title>
            <div className="small text-body-secondary">{owner}</div>
            {label && provisioner.name !== repoName ? (
              <code className="checksum">{provisioner.name}</code>
            ) : null}
          </div>
          <span className="d-flex flex-column align-items-end gap-1">
            <TierBadge entry={healthEntry} />
            <Badge bg="primary">v{latest.version}</Badge>
            <span className="d-flex gap-2">
              <a
                href={`https://github.com/${provisioner.repo}`}
                target="_blank"
                rel="noreferrer"
                title={t('card.viewOnGithub')}
                aria-label={t('card.viewOnGithub')}
              >
                <FaGithub />
              </a>
              {homepage ? (
                <a
                  href={homepage}
                  target="_blank"
                  rel="noreferrer"
                  title={t('card.homepage')}
                  aria-label={t('card.homepage')}
                >
                  <FaHome />
                </a>
              ) : null}
              <a
                href={`https://github.com/${provisioner.repo}/issues/new`}
                target="_blank"
                rel="noreferrer"
                title={t('card.reportIssue')}
                aria-label={t('card.reportIssue')}
              >
                <FaBug />
              </a>
            </span>
          </span>
        </div>
        <CardMeta entry={healthEntry} />
        <HealthChips entry={healthEntry} />
        <Card.Text className="card-desc" title={provisioner.description || undefined}>
          {provisioner.description || t('card.noDescription')}
        </Card.Text>
        <div className="mt-auto">
          <ProviderChips entry={healthEntry} />
          <Accordion flush>
            <Accordion.Item eventKey="versions">
              <Accordion.Header>
                {t('card.version', { count: provisioner.versions.length })}
              </Accordion.Header>
              <Accordion.Body className="p-0">
                <ListGroup variant="flush" className="version-list">
                  {versions.map(entry => (
                    <ListGroup.Item key={entry.version}>
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <strong>{entry.version}</strong>
                        <span>
                          {entry.artifacts.map(artifact => (
                            <a key={artifact.url} href={artifact.url}>
                              {t('card.download')}
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
                  {hiddenCount > 0 || showAllVersions ? (
                    <ListGroup.Item className="text-center">
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0"
                        onClick={() => setShowAllVersions(current => !current)}
                      >
                        {showAllVersions
                          ? t('card.showFewer')
                          : t('card.showAll', { count: provisioner.versions.length })}
                      </Button>
                    </ListGroup.Item>
                  ) : null}
                </ListGroup>
              </Accordion.Body>
            </Accordion.Item>
            <QualityBreakdown entry={healthEntry} />
          </Accordion>
        </div>
      </Card.Body>
    </Card>
  );
};

ProvisionerCard.propTypes = {
  provisioner: provisionerShape.isRequired,
  healthEntry: healthEntryShape,
};

const matchesQuery = (provisioner, health, query) => {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const label = health?.provisioners?.[provisioner.name]?.presentation?.label || '';
  return [provisioner.name, provisioner.description || '', provisioner.repo, label].some(text =>
    text.toLowerCase().includes(needle)
  );
};

const CatalogSection = ({
  title = '',
  icon = null,
  subtitle = '',
  titleTooltip = '',
  provisioners,
  health = null,
  query = '',
  emptyNote = '',
}) => {
  const { t } = useTranslation();
  const filtered = provisioners.filter(provisioner => matchesQuery(provisioner, health, query));
  return (
    <section className="mb-5">
      {title ? (
        <h2
          className="h4 d-flex align-items-center gap-2 section-title"
          title={titleTooltip || undefined}
        >
          {icon}
          {title}
          {query.trim() ? (
            <Badge bg="secondary" pill>
              {filtered.length}/{provisioners.length}
            </Badge>
          ) : null}
        </h2>
      ) : null}
      {subtitle ? <p className="text-body-secondary mb-3">{subtitle}</p> : null}
      {filtered.length === 0 ? (
        <Alert variant="light">{query.trim() ? t('sections.noMatches') : emptyNote}</Alert>
      ) : (
        <Row xs={1} md={2} xl={3} className="g-3">
          {filtered.map(provisioner => (
            <Col key={provisioner.name}>
              <ProvisionerCard
                provisioner={provisioner}
                healthEntry={health?.provisioners?.[provisioner.name] || null}
              />
            </Col>
          ))}
        </Row>
      )}
    </section>
  );
};

CatalogSection.propTypes = {
  title: PropTypes.string,
  icon: PropTypes.node,
  subtitle: PropTypes.string,
  titleTooltip: PropTypes.string,
  provisioners: PropTypes.arrayOf(provisionerShape).isRequired,
  health: PropTypes.shape({ provisioners: PropTypes.object }),
  query: PropTypes.string,
  emptyNote: PropTypes.string,
};

export default CatalogSection;
