import PropTypes from 'prop-types';
import { Alert, Button, Card, Col, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBuilding } from 'react-icons/fa6';

import { OrgLogo, byPersonalLastThenName } from './chrome';

const ROLE_CLASSES = {
  OWNER: 'bg-danger',
  ADMIN: 'bg-warning',
  MEMBER: 'bg-secondary',
};

export const matchesOrg = (org, query) => {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [org.name || '', org.description || ''].some(text => text.toLowerCase().includes(needle));
};

const OrgStatus = ({ result }) => {
  const { t } = useTranslation();
  if (!result) {
    return <span className="small text-body-secondary">{t('orgs.loading')}</span>;
  }
  if (result.catalog) {
    return (
      <span className="small text-body-secondary">
        {t('orgs.provisioners', { count: result.catalog.provisioners.length })}
      </span>
    );
  }
  return (
    <span className="small text-body-secondary">
      {result.errorKey ? t(result.errorKey) : result.errorMessage}
    </span>
  );
};

OrgStatus.propTypes = {
  result: PropTypes.shape({
    catalog: PropTypes.shape({ provisioners: PropTypes.array.isRequired }),
    errorKey: PropTypes.string,
    errorMessage: PropTypes.string,
  }),
};

const OrgCard = ({ org, result, onOpen }) => {
  const { t } = useTranslation();
  const published = Boolean(result?.catalog);
  return (
    <Card className="h-100 shadow-sm catalog-card">
      <Card.Body className="d-flex flex-column gap-2">
        <div className="d-flex align-items-center gap-2">
          <OrgLogo org={org} size={32} className="rounded-circle org-logo-lg" />
          <div className="flex-grow-1 min-width-0">
            <Card.Title className="mb-0 text-break">{org.name}</Card.Title>
            {org.description ? (
              <div className="small text-body-secondary">{org.description}</div>
            ) : null}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-1">
          {(org.roles || []).map(role => (
            <span key={role} className={`badge ${ROLE_CLASSES[role] || 'bg-secondary'}`}>
              {t(`roles.${role.toLowerCase()}`, { defaultValue: role })}
            </span>
          ))}
        </div>
        <div className="mt-auto d-flex align-items-center justify-content-between gap-2">
          <OrgStatus result={result} />
          <Button
            variant="outline-primary"
            size="sm"
            disabled={!published}
            onClick={() => onOpen(org.uuid)}
          >
            {t('orgs.open')}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
};

OrgCard.propTypes = {
  org: PropTypes.shape({
    uuid: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    logo: PropTypes.string,
    roles: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  result: OrgStatus.propTypes.result,
  onOpen: PropTypes.func.isRequired,
};

const OrgList = ({ organizations, results, filtering, onOpen }) => {
  const { t } = useTranslation();
  const rows = [...organizations].sort(byPersonalLastThenName);
  return (
    <section className="mb-5">
      <h2 className="h4 d-flex align-items-center gap-2 section-title">
        <FaBuilding aria-hidden />
        {t('sections.privateListTitle')}
      </h2>
      <p className="text-body-secondary mb-3">{t('sections.privateListSubtitle')}</p>
      {rows.length === 0 ? (
        <Alert variant="secondary">
          {filtering ? t('sections.noMatches') : t('sections.noOrgs')}
        </Alert>
      ) : (
        <Row xs={1} md={2} xl={3} className="g-3">
          {rows.map(org => (
            <Col key={org.uuid}>
              <OrgCard
                org={org}
                result={results.find(result => result.uuid === org.uuid) || null}
                onOpen={onOpen}
              />
            </Col>
          ))}
        </Row>
      )}
    </section>
  );
};

OrgList.propTypes = {
  organizations: PropTypes.arrayOf(OrgCard.propTypes.org).isRequired,
  results: PropTypes.arrayOf(PropTypes.shape({ uuid: PropTypes.string.isRequired })).isRequired,
  filtering: PropTypes.bool.isRequired,
  onOpen: PropTypes.func.isRequired,
};

export default OrgList;
