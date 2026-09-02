import axios from 'axios';
import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Alert, Container, Dropdown, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBook, FaBuilding, FaEnvelope, FaGlobe } from 'react-icons/fa6';

import './css/styles.css';
import './css/fonts.css';
import {
  API_ORIGIN,
  ISSUER,
  authHeaders,
  beginLogin,
  consumeSessionEnded,
  getAccessToken,
  getClaims,
  getUserInfo,
  savePreferences,
  signOut,
  signOutEverywhere,
} from './auth';
import CatalogSection, { filterProvisioners, providerCounts, tierCounts } from './CatalogCards.jsx';
import {
  Footer,
  Header,
  OrgLogo,
  SessionEndedBanner,
  byPersonalLastThenName,
  useNavbarSearchBinding,
  useTheme,
} from './chrome';
import {
  APP_NAME,
  Avatar,
  POWERED_BY,
  REPO_URL,
  VIEW_ALL_URL,
  buildTicketUrl,
  notificationsAdapter,
  pushAdapter,
} from './chromeProps.jsx';
import { getSupportedLanguages } from './i18n';
import OrgList, { matchesOrg } from './OrgList.jsx';
import { resyncPushSubscription } from './push';
import RebuildItem from './RebuildItem.jsx';

const PRIVATE_VIEW = 'private';
const ACTIVE_ORG_KEY = 'activeOrganization';
const PREFS_PREFIX = 'catalog_table_prefs_';

const CATALOG_FILTERS = ['tiers', 'providers'];
const ORG_FILTERS = ['roles', 'catalog'];
const ROLE_ORDER = ['OWNER', 'ADMIN', 'MEMBER'];

const filterNamesFor = view => (view === PRIVATE_VIEW ? ORG_FILTERS : CATALOG_FILTERS);

const emptyFilters = names => Object.fromEntries(names.map(name => [name, new Set()]));

const readPrefs = (key, names) => {
  try {
    const saved = JSON.parse(localStorage.getItem(`${PREFS_PREFIX}${key}`) || 'null');
    return Object.fromEntries(names.map(name => [name, new Set(saved?.[name] || [])]));
  } catch {
    return emptyFilters(names);
  }
};

const writePrefs = (key, filters) => {
  localStorage.setItem(
    `${PREFS_PREFIX}${key}`,
    JSON.stringify(
      Object.fromEntries(Object.entries(filters).map(([name, set]) => [name, [...set]]))
    )
  );
};

const toggleIn = (set, value) => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

const privateErrorKey = requestError => {
  const { status } = requestError.response || {};
  if (status === 404) {
    return 'errors.noPrivateCatalog';
  }
  if (status === 401 || status === 403) {
    return 'errors.accessDenied';
  }
  return '';
};

const resolveActiveOrg = (organizations, stored) => {
  if (stored && organizations.some(org => org.uuid === stored)) {
    return stored;
  }
  return (organizations.find(org => org.primary) || organizations[0])?.uuid || '';
};

const fetchPrivate = async path =>
  axios.get(path, { headers: await authHeaders('GET', `${API_ORIGIN}${path}`) });

const persistTheme = preference => savePreferences({ theme: preference });

const viewData = (view, orgResults, publicCatalog, publicHealth) => {
  if (!view) {
    return { org: null, provisioners: publicCatalog?.provisioners || [], health: publicHealth };
  }
  if (view === PRIVATE_VIEW) {
    return { org: null, provisioners: [], health: null };
  }
  const org = orgResults.find(entry => entry.uuid === view) || null;
  return { org, provisioners: org?.catalog?.provisioners || [], health: org?.health || null };
};

const hasFilters = (query, filters) =>
  query.trim() !== '' || Object.values(filters).some(set => set.size > 0);

const orgRoleCounts = organizations => {
  const counts = {};
  organizations.forEach(org => {
    (org.roles || []).forEach(role => {
      counts[role] = (counts[role] || 0) + 1;
    });
  });
  const extra = Object.keys(counts).filter(role => !ROLE_ORDER.includes(role));
  const ordered = {};
  [...ROLE_ORDER, ...extra]
    .filter(role => counts[role])
    .forEach(role => {
      ordered[role] = counts[role];
    });
  return ordered;
};

const orgCatalogCounts = (organizations, published) => {
  const counts = {};
  organizations.forEach(org => {
    const key = published(org.uuid) ? 'published' : 'unpublished';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const matchesOrgFilters = (org, filters, published) =>
  (filters.roles.size === 0 || (org.roles || []).some(role => filters.roles.has(role))) &&
  (filters.catalog.size === 0 ||
    filters.catalog.has(published(org.uuid) ? 'published' : 'unpublished'));

const buildOrgGroups = (t, organizations, published, filters, updateFilters) => [
  {
    key: 'role',
    label: t('orgs.role'),
    entries: orgRoleCounts(organizations),
    activeSet: filters.roles,
    activeClass: 'bg-primary',
    labelFor: role => t(`roles.${role.toLowerCase()}`, { defaultValue: role }),
    onToggle: role =>
      updateFilters(current => ({ ...current, roles: toggleIn(current.roles, role) })),
  },
  {
    key: 'catalog',
    label: t('orgs.catalogGroup'),
    entries: orgCatalogCounts(organizations, published),
    activeSet: filters.catalog,
    activeClass: 'bg-success',
    labelFor: value => t(`orgs.${value}`),
    onToggle: value =>
      updateFilters(current => ({ ...current, catalog: toggleIn(current.catalog, value) })),
  },
];

const buildGroups = (t, provisioners, health, filters, updateFilters) => [
  {
    key: 'tier',
    label: t('search.tier'),
    entries: tierCounts(provisioners, health),
    activeSet: filters.tiers,
    activeClass: 'bg-primary',
    pillClass: tier => `tier-badge tier-${tier}`,
    labelFor: tier => t(`tiers.${tier}`),
    onToggle: tier =>
      updateFilters(current => ({ ...current, tiers: toggleIn(current.tiers, tier) })),
  },
  {
    key: 'provider',
    label: t('search.provider'),
    entries: providerCounts(provisioners, health),
    activeSet: filters.providers,
    activeClass: 'bg-primary',
    onToggle: provider =>
      updateFilters(current => ({ ...current, providers: toggleIn(current.providers, provider) })),
  },
];

const buildCrumbs = ({ t, view, organizations, published, goTo }) => {
  if (organizations.length === 0) {
    return [];
  }
  const isPublic = view === '';
  const org = view && view !== PRIVATE_VIEW ? organizations.find(o => o.uuid === view) : null;
  const crumbs = [
    {
      key: 'group',
      icon: isPublic ? <FaGlobe aria-hidden /> : <FaBuilding aria-hidden />,
      label: t(isPublic ? 'navbar.publicCrumb' : 'navbar.privateCrumb'),
      picker: [
        {
          key: 'public',
          icon: <FaGlobe className="me-2" />,
          label: t('navbar.publicCrumb'),
          active: isPublic,
          onPick: () => goTo(''),
        },
        {
          key: 'private',
          icon: <FaBuilding className="me-2" />,
          label: t('navbar.privateCrumb'),
          active: !isPublic,
          onPick: () => goTo(PRIVATE_VIEW),
        },
      ],
    },
  ];
  if (org) {
    crumbs.push({
      key: 'org',
      icon: <OrgLogo org={org} size={16} className="rounded-circle avatar-sm" />,
      label: org.name,
      picker: [...organizations].sort(byPersonalLastThenName).map(row => ({
        key: row.uuid,
        icon: <OrgLogo org={row} size={16} className="rounded-circle avatar-sm me-2" />,
        label: row.name,
        active: row.uuid === org.uuid,
        disabled: !published(row.uuid),
        hint: published(row.uuid) ? null : t('orgs.noCatalog'),
        onPick: () => goTo(row.uuid),
      })),
    });
  }
  return crumbs;
};

const OrgIcon = ({ org }) =>
  org.logo ? (
    <img
      src={org.logo}
      alt=""
      className="org-logo"
      onError={event => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <FaBuilding aria-hidden />
  );

OrgIcon.propTypes = {
  org: PropTypes.shape({ logo: PropTypes.string }).isRequired,
};

const PublicView = ({ catalog, health, error, provisioners, filtering }) => {
  const { t } = useTranslation();
  return (
    <>
      {error ? (
        <Alert variant="danger">{t('sections.publicLoadFailed', { message: error })}</Alert>
      ) : null}
      {!catalog && !error ? <Spinner animation="border" role="status" /> : null}
      {catalog ? (
        <CatalogSection
          title={t('sections.publicTitle')}
          icon={<FaGlobe aria-hidden />}
          titleTooltip={t('sections.publicSubtitle', { updated: catalog.updated })}
          provisioners={provisioners}
          health={health}
          filtering={filtering}
          emptyNote={t('sections.publicEmpty')}
        />
      ) : null}
    </>
  );
};

PublicView.propTypes = {
  catalog: PropTypes.shape({ updated: PropTypes.string }),
  health: PropTypes.shape({ provisioners: PropTypes.object }),
  error: PropTypes.string.isRequired,
  provisioners: PropTypes.array.isRequired,
  filtering: PropTypes.bool.isRequired,
};

const OrgView = ({ org, loading, provisioners, filtering }) => {
  const { t } = useTranslation();
  if (!org) {
    if (loading) {
      return <Spinner animation="border" role="status" />;
    }
    return <Alert variant="secondary">{t('errors.noPrivateCatalog')}</Alert>;
  }
  if (!org.catalog) {
    return (
      <section className="mb-5">
        <h2 className="h4 d-flex align-items-center gap-2 section-title">
          <OrgIcon org={org} />
          {org.name}
        </h2>
        <Alert variant="secondary">{org.errorKey ? t(org.errorKey) : org.errorMessage}</Alert>
      </section>
    );
  }
  return (
    <CatalogSection
      title={org.name}
      icon={<OrgIcon org={org} />}
      subtitle={t('sections.privateSubtitle', { org: org.name })}
      provisioners={provisioners}
      health={org.health}
      filtering={filtering}
      emptyNote={t('sections.orgEmpty')}
    />
  );
};

OrgView.propTypes = {
  org: PropTypes.shape({
    name: PropTypes.string,
    logo: PropTypes.string,
    catalog: PropTypes.object,
    health: PropTypes.object,
    errorKey: PropTypes.string,
    errorMessage: PropTypes.string,
  }),
  loading: PropTypes.bool.isRequired,
  provisioners: PropTypes.array.isRequired,
  filtering: PropTypes.bool.isRequired,
};

const AppRows = ({ isAdmin }) => {
  const { t } = useTranslation();
  return (
    <>
      {isAdmin ? <RebuildItem /> : null}
      <Dropdown.Item
        href="https://startcloud.com/#contact"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FaEnvelope className="me-2" />
        {t('navbar.contact')}
      </Dropdown.Item>
      <Dropdown.Item href="/docs/">
        <FaBook className="me-2" />
        {t('navbar.docs')}
      </Dropdown.Item>
    </>
  );
};

AppRows.propTypes = {
  isAdmin: PropTypes.bool.isRequired,
};

const buildUserMenu = ({
  t,
  user,
  userInfo,
  organizations,
  activeOrgUuid,
  activeOrg,
  goTo,
  onSignOut,
}) => {
  const displayName = userInfo?.name || user.name || user.email || t('user.unknownUser');
  const picture = userInfo?.picture || '';
  return {
    displayName,
    email: user.email && user.email !== displayName ? user.email : '',
    renderAvatar: size => <Avatar picture={picture} size={size} />,
    issuerUrl: ISSUER,
    organizations,
    activeOrgUuid,
    onPickOrg: goTo,
    favorites: userInfo?.favorite_apps || [],
    appName: t('navbar.provisionerCatalog'),
    appRows: <AppRows isAdmin={Boolean(user.authorities?.includes('ROLE_ADMIN'))} />,
    notifications: String(user.scope || '').includes('notifications') ? notificationsAdapter : null,
    push: pushAdapter,
    viewAllUrl: VIEW_ALL_URL,
    ticketUrl: buildTicketUrl(user, userInfo, activeOrg),
    onSignOut,
    onSignOutEverywhere: signOutEverywhere,
  };
};

const App = () => {
  const { t, i18n } = useTranslation(['common', 'auth']);
  const [publicCatalog, setPublicCatalog] = useState(null);
  const [publicHealth, setPublicHealth] = useState(null);
  const [publicError, setPublicError] = useState('');
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [orgResults, setOrgResults] = useState([]);
  const [activeOrgUuid, setActiveOrgUuid] = useState('');
  const [view, setView] = useState('');
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(() => consumeSessionEnded());
  const [query, setQuery] = useState('');
  const [filtersByView, setFiltersByView] = useState({});
  const {
    preference: themePreference,
    setPreference: setThemePreference,
    toggleTheme,
  } = useTheme({ onPersist: persistTheme });

  useEffect(() => {
    axios
      .get('/catalog.json')
      .then(({ data }) => setPublicCatalog(data))
      .catch(fetchError => setPublicError(fetchError.message));
    axios
      .get('/health.json')
      .then(({ data }) => setPublicHealth(data))
      .catch(() => setPublicHealth(null));
  }, []);

  useEffect(() => {
    const loadPrivate = async () => {
      const token = await getAccessToken();
      if (!token) {
        setSessionEnded(consumeSessionEnded());
        return;
      }
      const claims = getClaims();
      setUser(claims);
      getUserInfo().then(info => {
        setUserInfo(info);
        const preferences = info?.preferences;
        setThemePreference(preferences?.theme, { persist: false });
        if (preferences?.language && preferences.language !== i18n.language) {
          i18n.changeLanguage(preferences.language);
        }
      });
      const organizations = claims?.organizations || [];
      const resolved = resolveActiveOrg(organizations, localStorage.getItem(ACTIVE_ORG_KEY));
      setActiveOrgUuid(resolved);
      if (resolved) {
        localStorage.setItem(ACTIVE_ORG_KEY, resolved);
      } else {
        localStorage.removeItem(ACTIVE_ORG_KEY);
      }
      if (organizations.length === 0) {
        return;
      }
      setLoadingPrivate(true);
      const results = await Promise.all(
        organizations.map(async org => {
          try {
            const [catalogRes, healthRes] = await Promise.all([
              fetchPrivate(`/private/${org.uuid}/catalog.json`),
              fetchPrivate(`/private/${org.uuid}/health.json`).catch(() => null),
            ]);
            return {
              ...org,
              catalog: catalogRes.data,
              health: healthRes?.data || null,
              errorKey: '',
              errorMessage: '',
            };
          } catch (requestError) {
            return {
              ...org,
              catalog: null,
              health: null,
              errorKey: privateErrorKey(requestError),
              errorMessage: requestError.message,
              status: requestError.response?.status,
            };
          }
        })
      );
      if (results.some(result => result.status === 401)) {
        signOut();
        setUser(null);
        setUserInfo(null);
        setSessionEnded(true);
        setLoadingPrivate(false);
        return;
      }
      setOrgResults(results);
      setLoadingPrivate(false);
    };
    loadPrivate();
  }, [i18n, setThemePreference]);

  useEffect(() => {
    resyncPushSubscription();
  }, []);

  const viewKey = view || 'home';

  useEffect(() => {
    const current = filtersByView[viewKey];
    if (current) {
      writePrefs(viewKey, current);
    }
  }, [viewKey, filtersByView]);

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setUserInfo(null);
    setOrgResults([]);
    setActiveOrgUuid('');
    setView('');
    localStorage.removeItem(ACTIVE_ORG_KEY);
  };

  const handleSignIn = () => {
    setSessionEnded(false);
    beginLogin();
  };

  const changeLanguage = async lang => {
    await i18n.changeLanguage(lang);
    savePreferences({ language: lang });
  };

  const goTo = target => {
    if (target && target !== PRIVATE_VIEW) {
      setActiveOrgUuid(target);
      localStorage.setItem(ACTIVE_ORG_KEY, target);
    }
    setView(target);
    setQuery('');
    window.scrollTo({ top: 0 });
  };

  const organizations = user?.organizations || [];
  const activeOrg = organizations.find(org => org.uuid === activeOrgUuid) || null;
  const names = filterNamesFor(view);
  const filters = filtersByView[viewKey] || readPrefs(viewKey, names);

  const updateFilters = updater => {
    setFiltersByView(current => ({
      ...current,
      [viewKey]: updater(current[viewKey] || readPrefs(viewKey, names)),
    }));
  };

  const currentView = user ? view : '';
  const shown = viewData(currentView, orgResults, publicCatalog, publicHealth);
  const listing = currentView === PRIVATE_VIEW;
  const published = uuid => Boolean(orgResults.find(result => result.uuid === uuid)?.catalog);
  const filtered = listing
    ? []
    : filterProvisioners(shown.provisioners, shown.health, query, filters);
  const filteredOrgs = listing
    ? organizations.filter(
        org => matchesOrg(org, query) && matchesOrgFilters(org, filters, published)
      )
    : [];
  const filtering = hasFilters(query, filters);

  useNavbarSearchBinding({
    query,
    onQueryChange: setQuery,
    placeholder: t(listing ? 'search.placeholderOrgs' : 'search.placeholder'),
    matched: listing ? filteredOrgs.length : filtered.length,
    total: listing ? organizations.length : shown.provisioners.length,
    groups: listing
      ? buildOrgGroups(t, organizations, published, filters, updateFilters)
      : buildGroups(t, shown.provisioners, shown.health, filters, updateFilters),
    onClearFilters: () => updateFilters(() => emptyFilters(names)),
  });

  const userMenu = user
    ? buildUserMenu({
        t,
        user,
        userInfo,
        organizations,
        activeOrgUuid,
        activeOrg,
        goTo,
        onSignOut: handleSignOut,
      })
    : null;

  const renderBody = () => {
    if (listing) {
      return (
        <OrgList
          organizations={filteredOrgs}
          results={orgResults}
          filtering={filtering}
          onOpen={goTo}
        />
      );
    }
    if (currentView) {
      return (
        <OrgView
          org={shown.org}
          loading={loadingPrivate}
          provisioners={filtered}
          filtering={filtering}
        />
      );
    }
    return (
      <PublicView
        catalog={publicCatalog}
        health={publicHealth}
        error={publicError}
        provisioners={filtered}
        filtering={filtering}
      />
    );
  };

  return (
    <div className="App d-flex flex-column min-vh-100">
      <Header
        brand={{
          name: APP_NAME,
          logo: <img src="/startcloud.svg" alt="" className="logo-cluster icon-with-margin-sm" />,
          href: '/',
          onClick: () => goTo(''),
        }}
        links={[
          { key: 'contact', label: t('navbar.contact'), href: 'https://startcloud.com/#contact' },
          { key: 'docs', label: t('navbar.docs'), href: '/docs/' },
        ]}
        crumbs={buildCrumbs({ t, view: currentView, organizations, published, goTo })}
        theme={{ preference: themePreference, onToggle: toggleTheme }}
        language={{ languages: getSupportedLanguages(), onPick: changeLanguage }}
        signedIn={Boolean(user)}
        onSignIn={handleSignIn}
        userMenu={userMenu}
      />

      {sessionEnded && !user ? <SessionEndedBanner onSignIn={handleSignIn} /> : null}

      <section className="hero">
        <Container>
          <img
            src="https://startcloud.com/assets/images/logos/startCloud-logo-big.svg"
            className="img-fluid"
            alt="STARTcloud logo"
          />
        </Container>
      </section>

      <Container className="py-4 flex-grow-1">{renderBody()}</Container>

      <Footer
        appName={APP_NAME}
        version={__APP_VERSION__}
        repoUrl={REPO_URL}
        poweredBy={POWERED_BY}
      />
    </div>
  );
};

export default App;
