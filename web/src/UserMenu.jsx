import PropTypes from 'prop-types';
import { useState } from 'react';
import { Button, Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaBook,
  FaChevronRight,
  FaCog,
  FaEnvelope,
  FaSignInAlt,
  FaTicketAlt,
  FaUserCircle,
} from 'react-icons/fa';

import { ISSUER } from './auth';
import FavoriteApps from './FavoriteApps.jsx';
import LogoutItem from './LogoutItem.jsx';
import NotificationsItem from './NotificationsItem.jsx';
import OrgSwitcher, { OrgLogo } from './OrgSwitcher.jsx';
import RebuildItem from './RebuildItem.jsx';

const TICKET_BASE_URL = 'https://xd.prominic.net/app/apprequest.nsf/router?openagent';
const TICKET_REQ_TYPE = 'sso';
const TICKET_CONTEXT = `provisioner-catalog|${__APP_VERSION__}`;
const FALLBACK_CUSTOMER_ID = 'A55DF1';

const buildTicketUrl = (user, userInfo, activeOrg) => {
  const params = new URLSearchParams({
    req: TICKET_REQ_TYPE,
    customerId: activeOrg?.customer_id || userInfo?.customer_id || FALLBACK_CUSTOMER_ID,
    user: user.name || '',
    email: user.email || '',
    context: TICKET_CONTEXT,
  });
  return `${TICKET_BASE_URL}&${params.toString()}`;
};

const Avatar = ({ picture = '', size }) =>
  picture ? (
    <img src={picture} alt="" width={size} height={size} className="rounded-circle flex-shrink-0" />
  ) : (
    <FaUserCircle size={size} className="flex-shrink-0" aria-hidden />
  );

Avatar.propTypes = {
  picture: PropTypes.string,
  size: PropTypes.number.isRequired,
};

const SignInButton = ({ onSignIn }) => {
  const { t } = useTranslation();
  return (
    <Button
      variant="primary"
      size="sm"
      className="d-inline-flex align-items-center gap-2"
      onClick={onSignIn}
    >
      <FaSignInAlt aria-hidden />
      {t('header.signIn')}
    </Button>
  );
};

SignInButton.propTypes = {
  onSignIn: PropTypes.func.isRequired,
};

const IdentityCard = ({ displayName, email, picture }) => (
  <Dropdown.Item
    href={`${ISSUER}/user/profile`}
    target="_blank"
    rel="noopener noreferrer"
    className="user-card d-flex align-items-center gap-3"
  >
    <Avatar picture={picture} size={36} />
    <span className="flex-grow-1 min-width-0">
      <span className="d-block fw-semibold text-truncate">{displayName}</span>
      {email ? <small className="d-block text-body-secondary text-truncate">{email}</small> : null}
    </span>
    <FaChevronRight className="text-body-secondary flex-shrink-0" aria-hidden />
  </Dropdown.Item>
);

IdentityCard.propTypes = {
  displayName: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  picture: PropTypes.string,
};

const UserMenu = ({
  user = null,
  userInfo = null,
  organizations = [],
  activeOrgUuid = '',
  onPickOrg,
  onSignIn,
  onSignOut,
  onSignOutEverywhere,
}) => {
  const { t } = useTranslation();
  const [showOrgs, setShowOrgs] = useState(false);

  if (!user) {
    return <SignInButton onSignIn={onSignIn} />;
  }

  const hasNotifications = String(user.scope || '').includes('notifications');
  const isAdmin = Boolean(user.authorities?.includes('ROLE_ADMIN'));
  const activeOrg = organizations.find(org => org.uuid === activeOrgUuid) || null;
  const displayName = userInfo?.name || user.name || user.email || t('header.signedIn');
  const email = user.email && user.email !== displayName ? user.email : '';
  const picture = userInfo?.picture || '';

  return (
    <>
      <Dropdown align="end" className="user-menu">
        <Dropdown.Toggle
          bsPrefix="btn"
          variant="link"
          className="d-flex align-items-center gap-2 text-decoration-none p-1 user-menu-toggle"
          aria-label={t('header.menuAria')}
        >
          <span className="text-truncate user-menu-name fw-semibold">{displayName}</span>
          <Avatar picture={picture} size={34} />
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <IdentityCard displayName={displayName} email={email} picture={picture} />

          {organizations.length >= 2 && activeOrg ? (
            <Dropdown.Item
              as="button"
              type="button"
              onClick={() => setShowOrgs(true)}
              className="d-flex align-items-center gap-2"
            >
              <OrgLogo org={activeOrg} />
              <span className="text-truncate">{activeOrg.name}</span>
            </Dropdown.Item>
          ) : null}

          <Dropdown.Item
            href={`${ISSUER}/user/profile#preferences`}
            target="_blank"
            rel="noopener noreferrer"
            className="d-flex align-items-center gap-2"
          >
            <FaCog aria-hidden />
            <span>{t('header.preferences')}</span>
          </Dropdown.Item>

          <FavoriteApps apps={userInfo?.favorite_apps || []} />

          <Dropdown.Divider />
          <Dropdown.Header>{t('header.brand')}</Dropdown.Header>
          {isAdmin ? <RebuildItem /> : null}
          <Dropdown.Item
            href="https://startcloud.com/#contact"
            target="_blank"
            rel="noopener noreferrer"
            className="d-flex align-items-center gap-2"
          >
            <FaEnvelope aria-hidden />
            <span>{t('header.contact')}</span>
          </Dropdown.Item>
          <Dropdown.Item href="/docs/" className="d-flex align-items-center gap-2">
            <FaBook aria-hidden />
            <span>{t('header.docs')}</span>
          </Dropdown.Item>

          <Dropdown.Divider />
          {hasNotifications ? <NotificationsItem /> : null}
          <Dropdown.Item
            href={buildTicketUrl(user, userInfo, activeOrg)}
            target="_blank"
            rel="noopener noreferrer"
            className="d-flex align-items-center gap-2"
          >
            <FaTicketAlt aria-hidden />
            <span>{t('header.help')}</span>
          </Dropdown.Item>

          <Dropdown.Divider />
          <LogoutItem onSignOut={onSignOut} onSignOutEverywhere={onSignOutEverywhere} />
        </Dropdown.Menu>
      </Dropdown>

      <OrgSwitcher
        show={showOrgs}
        onHide={() => setShowOrgs(false)}
        organizations={organizations}
        activeUuid={activeOrgUuid}
        onPick={uuid => {
          setShowOrgs(false);
          onPickOrg(uuid);
        }}
      />
    </>
  );
};

UserMenu.propTypes = {
  user: PropTypes.shape({
    name: PropTypes.string,
    email: PropTypes.string,
    scope: PropTypes.string,
    authorities: PropTypes.arrayOf(PropTypes.string),
  }),
  userInfo: PropTypes.shape({
    customer_id: PropTypes.string,
    name: PropTypes.string,
    picture: PropTypes.string,
    favorite_apps: PropTypes.array,
  }),
  organizations: PropTypes.arrayOf(
    PropTypes.shape({
      uuid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      roles: PropTypes.arrayOf(PropTypes.string),
      primary: PropTypes.bool,
      personal: PropTypes.bool,
      customer_id: PropTypes.string,
      logo: PropTypes.string,
      description: PropTypes.string,
    })
  ),
  activeOrgUuid: PropTypes.string,
  onPickOrg: PropTypes.func.isRequired,
  onSignIn: PropTypes.func.isRequired,
  onSignOut: PropTypes.func.isRequired,
  onSignOutEverywhere: PropTypes.func.isRequired,
};

export default UserMenu;
