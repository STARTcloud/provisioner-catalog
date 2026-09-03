import { createI18n } from '../chrome';

const { i18n, ready, getSupportedLanguages } = createI18n({
  loadSupportedLanguages: () => __SUPPORTED_LOCALES__,
});

export { getSupportedLanguages };

export const i18nPromise = ready;

export default i18n;
