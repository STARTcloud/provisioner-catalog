import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Badge, Button, Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBell } from 'react-icons/fa';

import { ISSUER } from './auth';
import { fetchNotifications, fetchUnreadCount, markAllRead, markRead } from './notifications';

const NotificationBell = ({ user = null }) => {
  const { t, i18n } = useTranslation();
  const [unread, setUnread] = useState(0);
  const [entries, setEntries] = useState([]);
  const [failed, setFailed] = useState(false);
  const enabled = Boolean(user && String(user.scope || '').includes('notifications'));

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const load = () => {
      fetchUnreadCount()
        .then(data => setUnread(data?.count || 0))
        .catch(() => null);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const loadEntries = async () => {
    try {
      setFailed(false);
      const data = await fetchNotifications({ page: 0, size: 20 });
      setEntries(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch {
      setFailed(true);
    }
  };

  const openEntry = async entry => {
    if (!entry.readAt) {
      try {
        await markRead(entry.id);
        setUnread(count => Math.max(0, count - 1));
        setEntries(prev =>
          prev.map(item =>
            item.id === entry.id ? { ...item, readAt: new Date().toISOString() } : item
          )
        );
      } catch {
        setFailed(true);
      }
    }
    if (typeof entry.navigate === 'string' && entry.navigate.startsWith('https://')) {
      window.location.assign(entry.navigate);
    }
  };

  const readAll = async () => {
    try {
      await markAllRead();
      setUnread(0);
      setEntries(prev =>
        prev.map(item => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
      );
    } catch {
      setFailed(true);
    }
  };

  return (
    <Dropdown
      align="end"
      onToggle={open => {
        if (open) {
          loadEntries();
        }
      }}
    >
      <Dropdown.Toggle
        variant="outline-secondary"
        size="sm"
        aria-label={t('inbox.unreadAria', { count: unread })}
      >
        <FaBell aria-hidden />
        {unread > 0 ? (
          <Badge bg="danger" pill className="ms-1">
            {unread}
          </Badge>
        ) : null}
      </Dropdown.Toggle>
      <Dropdown.Menu className="notification-menu">
        <div className="d-flex justify-content-between align-items-center px-3 py-1">
          <strong>{t('inbox.title')}</strong>
          <Button variant="link" size="sm" className="p-0" onClick={readAll}>
            {t('inbox.markAllRead')}
          </Button>
        </div>
        <Dropdown.Divider />
        {failed ? (
          <Dropdown.ItemText className="small text-danger">
            {t('inbox.loadError')}
          </Dropdown.ItemText>
        ) : null}
        {!failed && entries.length === 0 ? (
          <Dropdown.ItemText className="small">{t('inbox.empty')}</Dropdown.ItemText>
        ) : null}
        {entries.map(entry => (
          <Dropdown.Item as="button" type="button" key={entry.id} onClick={() => openEntry(entry)}>
            <span
              className={`d-block text-truncate notification-title ${entry.readAt ? '' : 'fw-semibold'}`}
            >
              {entry.title}
            </span>
            {entry.body ? (
              <span className="d-block text-body-secondary notification-body">{entry.body}</span>
            ) : null}
            <span className="d-block text-body-secondary notification-time">
              {entry.createdAt ? new Date(entry.createdAt).toLocaleString(i18n.language) : ''}
            </span>
          </Dropdown.Item>
        ))}
        <Dropdown.Divider />
        <Dropdown.Item
          href={`${ISSUER}/notifications`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center small"
        >
          {t('inbox.viewAll')}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
};

NotificationBell.propTypes = {
  user: PropTypes.shape({
    scope: PropTypes.string,
  }),
};

export default NotificationBell;
