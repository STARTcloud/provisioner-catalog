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
      className="d-flex align-items-center gap-2 text-danger"
    >
      <span
        role="button"
        tabIndex={0}
        className="d-inline-flex logout-scope"
        onClick={toggleScope}
        onKeyDown={toggleScopeKey}
        title={everywhere ? t('header.logoutEverywhereTitle') : t('header.logoutLocalTitle')}
      >
        <ScopeIcon aria-hidden />
      </span>
      <span>{t('header.logout')}</span>
    </Dropdown.Item>
  );
};

LogoutItem.propTypes = {
  onSignOut: PropTypes.func.isRequired,
  onSignOutEverywhere: PropTypes.func.isRequired,
};

export default LogoutItem;
