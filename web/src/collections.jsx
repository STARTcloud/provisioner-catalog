import { Accordion, Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBug, FaCubes, FaGithub, FaHouse } from 'react-icons/fa6';

import { catalogAdapter } from './catalogAdapter';
import { downloadsColumn, itemShape, labelColumn, releasedColumn, versionsColumn } from './pages';

export const TIER_ORDER = ['diamond', 'platinum', 'gold', 'silver', 'bronze', 'unrated'];

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
    return 'N/A';
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

const ItemHeaderExtra = ({ item }) => {
  const { t } = useTranslation();
  const days = staleDays(item);
  return (
    <div className="d-flex flex-wrap align-items-center gap-3 mt-2 small text-body-secondary">
      <span>{item.extras.repo}</span>
      {days !== null ? <span>{t('card.released', { count: days })}</span> : null}
      {typeof item.downloads === 'number' ? (
        <span>{t('card.downloads', { count: item.downloads })}</span>
      ) : null}
      <CoverageChips item={item} />
    </div>
  );
};

ItemHeaderExtra.propTypes = {
  item: itemShape.isRequired,
};

const ItemActions = ({ item }) => {
  const { t } = useTranslation();
  return (
    <>
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
};

const ItemExtras = ({ item }) => {
  const { t } = useTranslation();
  return (
    <Accordion flush className="mb-4">
      <Accordion.Item eventKey="quality">
        <Accordion.Header>
          {t('card.quality', { tier: t(`tiers.${item.extras.tier}`) })}
        </Accordion.Header>
        <Accordion.Body>
          {item.extras.failedRules.length === 0 ? (
            <p className="mb-0">{t('card.allRulesPass')}</p>
          ) : (
            <>
              <p className="mb-1">{t('card.unmetRules')}</p>
              <ul className="mb-0">
                {item.extras.failedRules.map(rule => (
                  <li key={rule}>
                    <code>{rule}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
};

ItemExtras.propTypes = {
  item: itemShape.isRequired,
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
  render: item => <CoverageChips item={item} />,
};

export const provisioners = {
  key: 'provisioners',
  labelKey: 'collections.provisioners',
  icon: <FaCubes aria-hidden />,
  segment: '',
  hasVersions: true,
  itemRoute: true,
  searchKey: 'search.placeholder',
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
      labelKey: 'search.provider',
      values: item => Object.keys(item.extras.coverage.counts),
      activeClass: 'bg-primary',
    },
  ],
  columns: [
    labelColumn,
    tierColumn,
    releasedColumn,
    downloadsColumn,
    versionsColumn,
    coverageColumn,
  ],
  matches: (item, needle) =>
    [item.name, item.label || '', item.description || '', item.extras.repo].some(text =>
      text.toLowerCase().includes(needle)
    ),
  slots: { ItemChips, ItemHeaderExtra, ItemActions, ItemExtras },
};

export const collections = [provisioners];
