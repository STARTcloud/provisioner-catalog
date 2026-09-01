# FOLLOWUPS — single consolidated tracker

Working notes, not published docs. OPEN WORK ONLY — delete items as they close;
history lives in git and the issue tracker, not here. COMPLETED ITEMS GET
REMOVED — deletion is confirmation.

## Auth

- [ ] **Refresh token stored in localStorage** — the SPA keeps its OAuth
  refresh token in localStorage, where any XSS can exfiltrate it; this is the
  app's weakest security point. Options, strongest first: adopt DPoP
  (RFC 9449 — the STARTcloud auth server supports it, including public-client
  flows), which binds tokens to a browser-held key so a stolen token is
  useless; or keep tokens in memory only and rely on silent re-auth via the
  auth server session.
