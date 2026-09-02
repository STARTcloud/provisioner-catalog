import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBuilding, FaCheck, FaCrown } from 'react-icons/fa6';

const ROLE_CLASSES = {
  OWNER: 'bg-danger',
  ADMIN: 'bg-warning',
  MEMBER: 'bg-secondary',
};

export const OrgLogo = ({ org, size = 20, className = 'rounded-circle me-2' }) =>
  org.logo ? (
    <img
      src={org.logo}
      alt=""
      width={size}
      height={size}
      className={className}
      onError={event => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <FaBuilding className="logo-md icon-with-margin" aria-hidden />
  );

OrgLogo.propTypes = {
  org: PropTypes.shape({ logo: PropTypes.string }).isRequired,
  size: PropTypes.number,
  className: PropTypes.string,
};

const byPersonalLast = (a, b) => Number(Boolean(a.personal)) - Number(Boolean(b.personal));

const OrgSwitcher = ({ show, onHide, organizations, activeUuid = '', onPick }) => {
  const { t } = useTranslation();
  const rows = [...organizations].sort(byPersonalLast);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <FaBuilding className="me-2" />
          {t('orgSwitcher.title')}
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
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                  active ? 'border-primary border-2' : ''
                }`}
                onClick={() => onPick(org.uuid)}
              >
                <div>
                  <div className="d-flex align-items-center">
                    <OrgLogo org={org} />
                    <div>
                      <div className="fw-bold">{org.name}</div>
                      {org.description ? (
                        <small className="text-muted">{org.description}</small>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center">
                  {(org.roles || []).map(role => (
                    <span
                      key={role}
                      className={`badge ${ROLE_CLASSES[role] || 'bg-secondary'} me-2`}
                    >
                      {t(`roles.${role.toLowerCase()}`, { defaultValue: role })}
                    </span>
                  ))}
                  {org.primary ? (
                    <FaCrown
                      className="text-warning me-2"
                      title={t('orgSwitcher.primaryOrg')}
                      aria-label={t('orgSwitcher.primaryOrg')}
                    />
                  ) : null}
                  {active ? <FaCheck className="text-success" /> : null}
                </div>
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
