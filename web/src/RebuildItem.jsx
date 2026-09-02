import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { Dropdown, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaArrowsRotate } from 'react-icons/fa6';

import { API_ORIGIN, authHeaders } from './auth';

const POLL_INTERVAL_MS = 10000;
const POLL_LIMIT = 90;

const authed = async (method, path) => ({
  headers: await authHeaders(method, `${API_ORIGIN}${path}`),
});

const RebuildItem = () => {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pollRef = useRef(null);
  const sawRunRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(
    () => () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    },
    []
  );

  const stopPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setRunning(false);
  };

  const settle = data => {
    if (data.status === 'queued' || data.status === 'in_progress') {
      sawRunRef.current = true;
      return;
    }
    if (data.status === 'completed' && sawRunRef.current) {
      stopPolling();
      setFeedback(
        data.conclusion === 'success'
          ? t('rebuild.done')
          : t('rebuild.failed', { message: data.conclusion || 'unknown' })
      );
    }
  };

  const pollOnce = async () => {
    pollCountRef.current += 1;
    if (pollCountRef.current > POLL_LIMIT) {
      stopPolling();
      return;
    }
    try {
      const { data } = await axios.get(
        '/admin/rebuild/status',
        await authed('GET', '/admin/rebuild/status')
      );
      settle(data);
    } catch {
      stopPolling();
    }
  };

  const rebuild = async () => {
    setFeedback('');
    try {
      await axios.post('/admin/rebuild', null, await authed('POST', '/admin/rebuild'));
      setFeedback(t('rebuild.running'));
      setRunning(true);
      sawRunRef.current = false;
      pollCountRef.current = 0;
      pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
    } catch (rebuildError) {
      setFeedback(t('rebuild.failed', { message: rebuildError.message }));
    }
  };

  return (
    <>
      <Dropdown.Item as="button" type="button" onClick={rebuild} disabled={running}>
        {running ? (
          <Spinner animation="border" size="sm" role="status" className="me-2" />
        ) : (
          <FaArrowsRotate className="me-2" />
        )}
        {t('navbar.rebuild')}
      </Dropdown.Item>
      {feedback ? <Dropdown.ItemText className="small">{feedback}</Dropdown.ItemText> : null}
    </>
  );
};

export default RebuildItem;
