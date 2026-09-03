import PropTypes from 'prop-types';
import { useState } from 'react';
import { Accordion, Badge, Button, ListGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBug, FaCubes, FaGithub, FaHouse } from 'react-icons/fa6';

import { catalogAdapter } from './adapter';
import { DeployButton, ProvisionerQuickActions, deployableVersion } from './deploy';
import {
  CollapseButton,
  downloadsColumn,
  itemShape,
  labelColumn,
  releasedColumn,
  versionsColumn,
  visibilityColumn,
} from './pages';

export const TIER_ORDER = ['diamond', 'platinum', 'gold', 'silver', 'bronze', 'unrated'];
const VISIBLE_VERSIONS = 10;
const RULES_GUIDE = '/docs/guides/quality-tiers/';

const coverageClass = (count, total) => {
  if (count === total) {
    return 'provider-all';
  }
  if (count === 1) {
    return 'provider-one';
  }
  return 'provider-some';
};

const CoverageChips = ({ item }) => {
  const { t } = useTranslation();
  const { counts, total } = item.extras.coverage;
  const providers = Object.keys(counts).sort();
  if (providers.length === 0) {
    return null;
  }
  return (
    <span className="d-inline-flex flex-wrap gap-1">
      {providers.map(provider => (
        <Badge
          key={provider}
          className={`provider-chip ${coverageClass(counts[provider], total)}`}
          title={t('card.providerCoverage', { count: counts[provider], total })}
        >
          {provider}
        </Badge>
      ))}
    </span>
  );
};

CoverageChips.propTypes = {
  item: itemShape.isRequired,
};

const TierBadge = ({ item }) => {
  const { t } = useTranslation();
  return (
    <Badge className={`tier-badge tier-${item.extras.tier}`} title={t('card.tierTooltip')}>
      {t(`tiers.${item.extras.tier}`)}
    </Badge>
  );
};

TierBadge.propTypes = {
  item: itemShape.isRequired,
};

const staleDays = item => {
  if (!item.latestReleaseAt) {
    return null;
  }
  return Math.floor((Date.now() - new Date(item.latestReleaseAt).getTime()) / 86400000);
};

const ItemChips = ({ item }) => {
  const { t } = useTranslation();
  const days = staleDays(item);
  return (
    <>
      <TierBadge item={item} />
      {item.versions[0] ? <Badge bg="primary">v{item.versions[0].version}</Badge> : null}
      {days !== null ? <Badge bg="secondary">{t('card.released', { count: days })}</Badge> : null}
      {typeof item.downloads === 'number' ? (
        <Badge bg="secondary">{t('card.downloads', { count: item.downloads })}</Badge>
      ) : null}
      {days !== null && days > 365 ? (
        <Badge bg="warning" text="dark">
          {t('health.stale', { count: days })}
        </Badge>
      ) : null}
      {item.extras.artifactsOk ? null : <Badge bg="danger">{t('health.artifactErrors')}</Badge>}
      {item.extras.sidecarsOk ? null : (
        <Badge bg="warning" text="dark">
          {t('health.sidecarGaps')}
        </Badge>
      )}
    </>
  );
};

ItemChips.propTypes = {
  item: itemShape.isRequired,
};

const ItemHeaderExtra = ({ item }) => (
  <div className="d-flex flex-wrap align-items-center gap-3 mt-2 small text-body-secondary">
    <CoverageChips item={item} />
  </div>
);

ItemHeaderExtra.propTypes = {
  item: itemShape.isRequired,
};

const ItemActions = ({ item, ctx }) => {
  const { t } = useTranslation();
  return (
    <>
      <DeployButton user={ctx.user} item={item} version={deployableVersion(item.versions)} />
      <a
        href={item.links.repo}
        target="_blank"
        rel="noreferrer"
        className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
      >
        <FaGithub />
        {t('card.viewOnGithub')}
      </a>
      {item.links.homepage ? (
        <a
          href={item.links.homepage}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
        >
          <FaHouse />
          {t('card.homepage')}
        </a>
      ) : null}
      <a
        href={item.links.issues}
        target="_blank"
        rel="noreferrer"
        className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
      >
        <FaBug />
        {t('card.reportIssue')}
      </a>
    </>
  );
};

ItemActions.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.shape({ user: PropTypes.object }).isRequired,
};

const QualityRules = ({ item }) => {
  const { t } = useTranslation();
  if (item.extras.failedRules.length === 0) {
    return <p className="mb-0">{t('card.allRulesPass')}</p>;
  }
  return (
    <>
      <p className="mb-1">{t('card.unmetRules')}</p>
      <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
        {item.extras.failedRules.map(rule => {
          const [tier] = rule.split('.');
          return (
            <li key={rule} className="d-flex align-items-start gap-2">
              <Badge className={`tier-badge tier-${tier}`}>{t(`tiers.${tier}`)}</Badge>
              <span>
                <a
                  href={`${RULES_GUIDE}#${tier}-rules`}
                  target="_blank"
                  rel="noreferrer"
                  className="fw-semibold"
                >
                  {t(`rules.${rule}.label`, { defaultValue: rule })}
                </a>
                <span className="d-block small text-body-secondary">
                  {t(`rules.${rule}.requirement`, { defaultValue: '' })}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
};

QualityRules.propTypes = {
  item: itemShape.isRequired,
};

const QualitySection = ({ item }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="list-table">
      <div className="d-flex align-items-center gap-2 mb-3">
        <CollapseButton collapsed={!open} onToggle={() => setOpen(current => !current)} />
        <h4 className="mb-0">{t('card.qualityHeading')}</h4>
        <TierBadge item={item} />
        <span className="badge bg-secondary bg-opacity-50">
          {t('card.unmetCount', { count: item.extras.failedRules.length })}
        </span>
      </div>
      {open ? <QualityRules item={item} /> : null}
    </div>
  );
};

QualitySection.propTypes = {
  item: itemShape.isRequired,
};

const CardExtras = ({ item, ctx }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const versions = showAll ? item.versions : item.versions.slice(0, VISIBLE_VERSIONS);
  const hidden = item.versions.length - versions.length;
  return (
    <>
      <CoverageChips item={item} />
      <Accordion flush>
        <Accordion.Item eventKey="versions">
          <Accordion.Header>{t('card.version', { count: item.versions.length })}</Accordion.Header>
          <Accordion.Body className="p-0">
            <ListGroup variant="flush" className="version-list">
              {versions.map(version => (
                <ListGroup.Item key={version.version}>
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <span className="d-inline-flex align-items-baseline gap-2 flex-wrap">
                      <strong>{version.version}</strong>
                      {version.createdAt ? (
                        <span className="small text-body-secondary">
                          {new Date(version.createdAt).toLocaleDateString(ctx.language)}
                        </span>
                      ) : null}
                      {version.providers.map(provider => (
                        <Badge key={provider.name} bg="secondary" className="badge-xs">
                          {provider.name}
                        </Badge>
                      ))}
                    </span>
                    <span>
                      {version.artifacts.map(artifact => (
                        <a key={artifact.downloadUrl} href={artifact.downloadUrl}>
                          {t('card.download')}
                        </a>
                      ))}
                    </span>
                  </div>
                  {version.artifacts.map(artifact => (
                    <code key={artifact.checksum} className="checksum d-block text-break">
                      {artifact.checksumType}:{artifact.checksum}
                    </code>
                  ))}
                </ListGroup.Item>
              ))}
              {hidden > 0 || showAll ? (
                <ListGroup.Item className="text-center">
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0"
                    onClick={() => setShowAll(current => !current)}
                  >
                    {showAll
                      ? t('card.showFewer')
                      : t('card.showAll', { count: item.versions.length })}
                  </Button>
                </ListGroup.Item>
              ) : null}
            </ListGroup>
          </Accordion.Body>
        </Accordion.Item>
        <Accordion.Item eventKey="quality">
          <Accordion.Header>
            {t('card.quality', { tier: t(`tiers.${item.extras.tier}`) })}
          </Accordion.Header>
          <Accordion.Body>
            <QualityRules item={item} />
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </>
  );
};

CardExtras.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.shape({ language: PropTypes.string.isRequired }).isRequired,
};

const tierColumn = {
  key: 'tier',
  labelKey: 'search.tier',
  sortValue: item => TIER_ORDER.indexOf(item.extras.tier),
  render: item => <TierBadge item={item} />,
};

const coverageColumn = {
  key: 'providers',
  labelKey: 'pages.table.providers',
  sortValue: item => Object.keys(item.extras.coverage.counts).sort().join(' ').toLowerCase(),
  render: item =>
    Object.keys(item.extras.coverage.counts).length > 0 ? <CoverageChips item={item} /> : 'N/A',
};

export const provisioners = {
  key: 'provisioners',
  labelKey: 'collections.provisioners',
  countKey: 'collections.provisionersCount',
  icon: <FaCubes aria-hidden />,
  segment: '',
  hasVersions: true,
  itemRoute: true,
  searchKey: 'search.placeholder',
  defaultView: 'cards',
  adapter: catalogAdapter,
  filterGroups: [
    {
      key: 'tier',
      labelKey: 'search.tier',
      values: item => [item.extras.tier],
      activeClass: 'bg-primary',
      pillClass: tier => `tier-badge tier-${tier}`,
      labelFor: (tier, t) => t(`tiers.${tier}`),
      order: TIER_ORDER,
    },
    {
      key: 'provider',
      labelKey: 'pages.filter.provider',
      values: item => Object.keys(item.extras.coverage.counts),
      activeClass: 'bg-primary',
    },
  ],
  columns: [
    labelColumn,
    visibilityColumn,
    downloadsColumn,
    tierColumn,
    releasedColumn,
    versionsColumn,
    coverageColumn,
  ],
  matches: (item, needle) =>
    [item.name, item.label || '', item.description || '', item.extras.repo].some(text =>
      text.toLowerCase().includes(needle)
    ),
  slots: {
    ItemChips,
    ItemHeaderExtra,
    ItemActions,
    ItemQuickActions: ProvisionerQuickActions,
    ItemSections: QualitySection,
    CardExtras,
  },
};

export const collections = [provisioners];
