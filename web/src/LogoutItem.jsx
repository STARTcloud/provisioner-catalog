import PropTypes from 'prop-types';
import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBridgeLock, FaHouseLock } from 'react-icons/fa6';

const LogoutItem = ({ onSignOut, onSignOutEverywhere }) => {
  const { t } = useTranslation();
  const [everywhere, setEverywhere] = useState(true);
  const ScopeIcon = everywhere ? FaBridgeLock : FaHouseLock;

  const toggleScope = event => {
    event.preventDefault();
    event.stopPropagation();
    setEverywhere(current => !current);
  };

  const toggleScopeKey = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      toggleScope(event);
    }
  };

  return (
    <Dropdown.Item
      as="button"
      type="button"
      onClick={everywhere ? onSignOutEverywhere : onSignOut}
      className="d-flex align-items-center text-danger"
    >
      <span
        role="button"
        tabIndex={0}
        className="d-inline-flex me-2 logout-scope"
        onClick={toggleScope}
        onKeyDown={toggleScopeKey}
        title={everywhere ? t('navbar.logoutEverywhereTitle') : t('navbar.logoutLocalTitle')}
      >
        <ScopeIcon />
      </span>
      <span>{t('navbar.logout')}</span>
    </Dropdown.Item>
  );
};

LogoutItem.propTypes = {
  onSignOut: PropTypes.func.isRequired,
  onSignOutEverywhere: PropTypes.func.isRequired,
};

export default LogoutItem;
