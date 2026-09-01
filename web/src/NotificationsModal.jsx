import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaBell,
  FaCog,
  FaEnvelope,
  FaExclamationTriangle,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';

import { ISSUER } from './auth';
import { deleteNotification, fetchNotifications, markAllRead, markRead } from './notifications';
import {
  isPushEnabled,
  isPushSupported,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
} from './push';

const TYPE_ICONS = {
  SECURITY: FaShieldAlt,
  OAUTH: FaShieldAlt,
  ACCOUNT: FaEnvelope,
  ADMIN: FaCog,
  SYSTEM: FaCog,
  ALERT: FaExclamationTriangle,
};

const SEVERITY_CLASSES = {
  DANGER: 'text-danger',
  CRITICAL: 'text-danger',
  ERROR: 'text-danger',
  WARNING: 'text-warning',
  SUCCESS: 'text-success',
  INFO: 'text-body-secondary',
};

const NotificationsModal = ({ show, onHide, onUnreadDelta }) => {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [failed, setFailed] = useState(false);
  const [pushOn, setPushOn] = useState(isPushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState('');

  useEffect(() => {
    if (!show) {
      return;
    }
    setFailed(false);
    fetchNotifications({ page: 0, size: 20 })
      .then(data => setEntries(Array.isArray(data?.notifications) ? data.notifications : []))
      .catch(() => setFailed(true));
  }, [show]);

  const openEntry = async entry => {
    if (!entry.readAt) {
      try {
        await markRead(entry.id);
        onUnreadDelta(-1);
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

  const dismiss = async entry => {
    try {
      await deleteNotification(entry.id);
      setEntries(prev => prev.filter(item => item.id !== entry.id));
      if (!entry.readAt) {
        onUnreadDelta(-1);
      }
    } catch {
      setFailed(true);
    }
  };

  const readAll = async () => {
    try {
      await markAllRead();
      onUnreadDelta(-Infinity);
      setEntries(prev =>
        prev.map(item => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
      );
    } catch {
      setFailed(true);
    }
  };

  const enablePush = async () => {
    if (!isPushSupported()) {
      setPushFeedback(t('notifications.notSupported'));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushFeedback(t('notifications.permissionDenied'));
      return;
    }
    await subscribePush();
    setPushEnabled(true);
    setPushOn(true);
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushFeedback('');
    try {
      if (pushOn) {
        await unsubscribePush();
        setPushEnabled(false);
        setPushOn(false);
      } else {
        await enablePush();
      }
    } catch (pushError) {
      if (pushError.response?.status === 403) {
        setPushFeedback(t('notifications.scopeMissing'));
      } else {
        setPushFeedback(pushOn ? t('notifications.disableError') : t('notifications.enableError'));
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-3">
          {t('inbox.title')}
          <Button variant="link" size="sm" className="p-0" onClick={readAll}>
            {t('inbox.markAllRead')}
          </Button>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        {failed ? <p className="small text-danger m-3">{t('inbox.loadError')}</p> : null}
        {!failed && entries.length === 0 ? (
          <p className="small text-body-secondary m-3">{t('inbox.empty')}</p>
        ) : null}
        <div className="notification-list">
          {entries.map(entry => {
            const TypeIcon = TYPE_ICONS[entry.type] || FaBell;
            return (
              <div
                key={entry.id}
                className="notification-row d-flex align-items-start gap-2 px-3 py-2"
              >
                <button
                  type="button"
                  className="btn btn-link p-0 text-start text-decoration-none flex-grow-1 d-flex align-items-start gap-2 min-width-0 text-body"
                  onClick={() => openEntry(entry)}
                >
                  <TypeIcon
                    className={`mt-1 flex-shrink-0 ${SEVERITY_CLASSES[entry.severity] || 'text-body-secondary'}`}
                    aria-hidden
                  />
                  <span className="flex-grow-1 min-width-0">
                    <span
                      className={`d-block notification-title ${entry.readAt ? '' : 'fw-semibold'}`}
                    >
                      {entry.title}
                    </span>
                    {entry.body ? (
                      <span className="d-block text-body-secondary notification-body">
                        {entry.body}
                      </span>
                    ) : null}
                    <span className="d-block text-body-secondary notification-time">
                      {entry.createdAt
                        ? new Date(entry.createdAt).toLocaleString(i18n.language)
                        : ''}
                    </span>
                  </span>
                  {entry.readAt ? null : <span className="notification-item-dot mt-2" />}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-body-secondary notification-dismiss"
                  onClick={() => dismiss(entry)}
                  title={t('inbox.dismiss')}
                  aria-label={t('inbox.dismiss')}
                >
                  <FaTimes aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="d-flex flex-column">
          <Form.Check
            type="switch"
            id="push-switch"
            label={t('notifications.pushSwitch')}
            checked={pushOn}
            disabled={pushBusy}
            onChange={togglePush}
          />
          {pushFeedback ? <small className="text-danger">{pushFeedback}</small> : null}
        </span>
        <a
          href={`${ISSUER}/notifications`}
          target="_blank"
          rel="noopener noreferrer"
          className="small"
        >
          {t('inbox.viewAll')}
        </a>
      </Modal.Footer>
    </Modal>
  );
};

NotificationsModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  onUnreadDelta: PropTypes.func.isRequired,
};

export default NotificationsModal;
