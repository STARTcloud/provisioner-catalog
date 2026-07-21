import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { Alert, Container, Spinner } from 'react-bootstrap';
import { createRoot } from 'react-dom/client';

import { completeLogin } from './auth';

import './styles.css';

// Module-level guard: the exchange must run exactly once even if the effect
// re-fires (React StrictMode double-invoke, HMR) — the PKCE verifier and
// state are consumed on first use.
let exchangeStarted = false;

const CallbackPage = () => {
  const [error, setError] = useState('');

  useEffect(() => {
    if (exchangeStarted) {
      return;
    }
    exchangeStarted = true;
    completeLogin()
      .then(() => window.location.replace('/'))
      .catch(loginError => setError(loginError.message));
  }, []);

  return (
    <Container className="py-5">
      {error ? (
        <Alert variant="danger">
          Sign-in failed: {error} — <Alert.Link href="/">return to the catalog</Alert.Link> and try
          again.
        </Alert>
      ) : (
        <p className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" role="status" />
          Completing sign-in…
        </p>
      )}
    </Container>
  );
};

createRoot(document.getElementById('root')).render(<CallbackPage />);
