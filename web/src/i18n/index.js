import { createInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

const supportedLngs = __SUPPORTED_LOCALES__;

export const getSupportedLanguages = () => supportedLngs;

const i18n = createInstance({
  fallbackLng: 'en',
  ns: ['common', 'auth'],
  defaultNS: 'common',
  debug: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: true,
  },
});

i18n.use(HttpApi).use(LanguageDetector).use(initReactI18next);

i18n.on('languageChanged', lng => {
  document.documentElement.lang = lng;
});

const initI18n = async () => {
  await i18n.init({
    supportedLngs,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  });
};

export const i18nPromise = initI18n();

export default i18n;
