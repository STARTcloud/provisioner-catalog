import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBuilding, FaCheck, FaCrown } from 'react-icons/fa';

const ROLE_CLASSES = {
  OWNER: 'bg-danger',
  ADMIN: 'bg-warning text-dark',
  MEMBER: 'bg-secondary',
};

export const OrgLogo = ({ org, size = 20 }) =>
  org.logo ? (
    <img
      src={org.logo}
      alt=""
      width={size}
      height={size}
      className="rounded-circle flex-shrink-0"
      onError={event => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <FaBuilding className="flex-shrink-0" aria-hidden />
  );

OrgLogo.propTypes = {
  org: PropTypes.shape({ logo: PropTypes.string }).isRequired,
  size: PropTypes.number,
};

const byPersonalLast = (a, b) => Number(Boolean(a.personal)) - Number(Boolean(b.personal));

const OrgSwitcher = ({ show, onHide, organizations, activeUuid = '', onPick }) => {
  const { t } = useTranslation();
  const rows = [...organizations].sort(byPersonalLast);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2">
          <FaBuilding aria-hidden />
          {t('orgs.switchTitle')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="list-group">
          {rows.map(org => {
            const active = org.uuid === activeUuid;
            return (
              <button
                key={org.uuid}
                type="button"
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3 ${
                  active ? 'border-primary border-2' : ''
                }`}
                onClick={() => onPick(org.uuid)}
              >
                <span className="d-inline-flex align-items-center gap-2 min-width-0">
                  <OrgLogo org={org} />
                  <span className="min-width-0">
                    <span className="fw-bold d-block text-truncate">{org.name}</span>
                    {org.description ? (
                      <small className="text-body-secondary d-block">{org.description}</small>
                    ) : null}
                  </span>
                </span>
                <span className="d-inline-flex align-items-center gap-2 flex-shrink-0">
                  {(org.roles || []).map(role => (
                    <span key={role} className={`badge ${ROLE_CLASSES[role] || 'bg-secondary'}`}>
                      {t(`orgs.roles.${role.toLowerCase()}`, { defaultValue: role })}
                    </span>
                  ))}
                  {org.primary ? (
                    <FaCrown
                      className="text-warning"
                      title={t('orgs.primary')}
                      aria-label={t('orgs.primary')}
                    />
                  ) : null}
                  {active ? (
                    <FaCheck className="text-success" aria-label={t('orgs.active')} />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </Modal.Body>
    </Modal>
  );
};

OrgSwitcher.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  organizations: PropTypes.arrayOf(
    PropTypes.shape({
      uuid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      roles: PropTypes.arrayOf(PropTypes.string),
      primary: PropTypes.bool,
      personal: PropTypes.bool,
      logo: PropTypes.string,
      description: PropTypes.string,
    })
  ).isRequired,
  activeUuid: PropTypes.string,
  onPick: PropTypes.func.isRequired,
};

export default OrgSwitcher;
