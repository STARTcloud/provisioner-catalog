import PropTypes from 'prop-types';
import { createContext, useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('catalog.theme');
    return savedTheme || 'auto';
  });

  useEffect(() => {
    const html = document.documentElement;

    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');
    } else {
      html.setAttribute('data-bs-theme', theme);
    }

    localStorage.setItem('catalog.theme', theme);

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = e => {
        html.setAttribute('data-bs-theme', e.matches ? 'dark' : 'light');
      };

      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
    return undefined;
  }, [theme]);

  const toggleTheme = () => {
    setTheme(current => {
      if (current === 'auto') {
        return 'light';
      }
      if (current === 'light') {
        return 'dark';
      }
      return 'auto';
    });
  };

  const setSpecificTheme = newTheme => {
    if (['auto', 'light', 'dark'].includes(newTheme)) {
      setTheme(newTheme);
    }
  };

  const getThemeDisplay = () => {
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return t('app.themeContext.autoStatus', { mode: prefersDark ? 'Dark' : 'Light' });
    }
    return theme.charAt(0).toUpperCase() + theme.slice(1);
  };

  const value = {
    theme,
    setTheme: setSpecificTheme,
    toggleTheme,
    getThemeDisplay,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

ThemeProvider.propTypes = {
  children: PropTypes.node,
};
