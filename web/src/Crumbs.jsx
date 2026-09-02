import PropTypes from 'prop-types';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBuilding, FaGlobe } from 'react-icons/fa6';

import { OrgLogo } from './OrgSwitcher.jsx';

export const PRIVATE_VIEW = 'private';

const byPersonalLastThenName = (a, b) =>
  Number(Boolean(a.personal)) - Number(Boolean(b.personal)) ||
  (a.name || '').localeCompare(b.name || '');

const Separator = () => (
  <li className="nav-item crumb-sep" aria-hidden>
    ›
  </li>
);

const CrumbToggle = ({ children }) => (
  <Dropdown.Toggle
    as="button"
    type="button"
    bsPrefix="nav-link"
    className="py-0 px-2 d-inline-flex align-items-center gap-2 dropdown-toggle crumb"
  >
    {children}
  </Dropdown.Toggle>
);

CrumbToggle.propTypes = {
  children: PropTypes.node.isRequired,
};

const organizationShape = PropTypes.shape({
  uuid: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  logo: PropTypes.string,
  personal: PropTypes.bool,
});

const Crumbs = ({ view, organizations, published, onPick }) => {
  const { t } = useTranslation();
  if (organizations.length === 0) {
    return null;
  }
  const isPublic = view === '';
  const org = view && view !== PRIVATE_VIEW ? organizations.find(o => o.uuid === view) : null;
  const rows = [...organizations].sort(byPersonalLastThenName);

  return (
    <>
      <Separator />
      <Dropdown as="li" className="nav-item">
        <CrumbToggle>
          {isPublic ? <FaGlobe aria-hidden /> : <FaBuilding aria-hidden />}
          {t(isPublic ? 'navbar.publicCrumb' : 'navbar.privateCrumb')}
        </CrumbToggle>
        <Dropdown.Menu>
          <Dropdown.Item as="button" type="button" active={isPublic} onClick={() => onPick('')}>
            <FaGlobe className="me-2" />
            {t('navbar.publicCrumb')}
          </Dropdown.Item>
          <Dropdown.Item
            as="button"
            type="button"
            active={!isPublic}
            onClick={() => onPick(PRIVATE_VIEW)}
          >
            <FaBuilding className="me-2" />
            {t('navbar.privateCrumb')}
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
      {org ? (
        <>
          <Separator />
          <Dropdown as="li" className="nav-item">
            <CrumbToggle>
              <OrgLogo org={org} size={16} className="rounded-circle avatar-sm" />
              {org.name}
            </CrumbToggle>
            <Dropdown.Menu>
              {rows.map(row => (
                <Dropdown.Item
                  key={row.uuid}
                  as="button"
                  type="button"
                  active={row.uuid === org.uuid}
                  disabled={!published(row.uuid)}
                  onClick={() => onPick(row.uuid)}
                >
                  <OrgLogo org={row} size={16} className="rounded-circle avatar-sm me-2" />
                  {row.name}
                  {published(row.uuid) ? null : (
                    <small className="ms-2 text-body-secondary">{t('orgs.noCatalog')}</small>
                  )}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </>
      ) : null}
    </>
  );
};

Crumbs.propTypes = {
  view: PropTypes.string.isRequired,
  organizations: PropTypes.arrayOf(organizationShape).isRequired,
  published: PropTypes.func.isRequired,
  onPick: PropTypes.func.isRequired,
};

export default Crumbs;
