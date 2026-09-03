import { useTranslation } from 'react-i18next';
import { FaBook, FaBug, FaCode, FaEnvelope, FaGithub, FaServer } from 'react-icons/fa6';

import { REPO_URL } from './chromeProps.jsx';
import { AboutPage } from './pages';

const FEATURES = ['catalogs', 'tiers', 'artifacts', 'watches', 'deploy'];
const COMPONENTS = [
  { key: 'data', details: ['releases', 'validation', 'tiers'] },
  { key: 'web', details: ['pages', 'signIn', 'shared'] },
  { key: 'worker', details: ['gate', 'push', 'config'] },
];

const About = () => {
  const { t } = useTranslation();
  const docs = [
    { key: 'docs', href: '/docs/', label: t('about.docs.docs'), Icon: FaBook },
    { key: 'api', href: '/docs/api/', label: t('about.docs.api'), Icon: FaCode },
    {
      key: 'gettingStarted',
      href: '/docs/guides/getting-started/',
      label: t('about.docs.gettingStarted'),
      Icon: FaServer,
    },
  ];
  const support = [
    { key: 'repository', href: REPO_URL, label: t('about.support.repository'), Icon: FaGithub },
    {
      key: 'issues',
      href: `${REPO_URL}/issues/new`,
      label: t('about.support.issues'),
      Icon: FaBug,
      tone: 'danger',
    },
    {
      key: 'contact',
      href: 'https://startcloud.com/#contact',
      label: t('about.support.contact'),
      Icon: FaEnvelope,
      tone: 'primary',
    },
  ];
  return (
    <AboutPage
      brand={<img src="/startcloud.svg" alt="" className="logo-xl flex-shrink-0" />}
      title={t('app.title')}
      description={t('about.description')}
      version={__APP_VERSION__}
      goal={t('about.goal')}
      features={FEATURES.map(key => t(`about.features.${key}`))}
      components={COMPONENTS.map(component => ({
        title: t(`about.components.${component.key}.title`),
        details: component.details.map(detail => t(`about.components.${component.key}.${detail}`)),
      }))}
      docs={docs}
      docsIntro={t('about.docs.intro')}
      support={support}
      supportIntro={t('about.support.intro')}
    />
  );
};

export default About;
