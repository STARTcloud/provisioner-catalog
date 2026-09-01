import { useEffect, useState } from 'react';
import { Badge, Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBell } from 'react-icons/fa';

import { fetchUnreadCount } from './notifications';
import NotificationsModal from './NotificationsModal.jsx';

const UNREAD_POLL_MS = 60000;

const NotificationsItem = () => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () => {
      fetchUnreadCount()
        .then(data => setUnread(data?.count || 0))
        .catch(() => null);
    };
    load();
    const interval = setInterval(load, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const adjustUnread = delta => {
    setUnread(count => (delta === -Infinity ? 0 : Math.max(0, count + delta)));
  };

  return (
    <>
      <Dropdown.Item
        as="button"
        type="button"
        onClick={() => setShow(true)}
        className="d-flex align-items-center gap-2"
      >
        <FaBell aria-hidden />
        <span className="flex-grow-1">{t('inbox.title')}</span>
        {unread > 0 ? (
          <Badge bg="danger" pill>
            {unread}
          </Badge>
        ) : null}
      </Dropdown.Item>
      <NotificationsModal show={show} onHide={() => setShow(false)} onUnreadDelta={adjustUnread} />
    </>
  );
};

export default NotificationsItem;
