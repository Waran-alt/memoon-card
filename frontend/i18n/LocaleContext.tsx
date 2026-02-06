'use client';

import { getBestLocale, type SupportedLocale } from 'i18n';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getLocaleFromStorage, saveLocaleToCookie, saveLocaleToStorage } from './storage';

/**
 * @file Locale Context for app-wide locale management.
 * 
 * Provides centralized locale state management with:
 * - Cookie/localStorage persistence
 * - SSR-safe initialization
 * - State synchronization
 * 
 * NOTE: This context does NOT handle routing/redirects.
 * Components should use Next.js router for navigation (e.g., LanguageSwitcher).
 */

/**
 * Locale context value interface.
 * Provides locale state and control functions.
 */
interface LocaleContextValue {
  /** Current active locale */
  locale: SupportedLocale;
  /** Function to change locale (does not navigate, only updates state/storage) */
  setLocale: (locale: SupportedLocale) => void;
}

/**
 * Locale context for sharing locale state across the app.
 */
const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

/**
 * Props for LocaleProvider component.
 */
interface LocaleProviderProps {
  /** Initial locale from server-side (extracted from URL params) */
  initialLocale: string;
  /** Child components */
  children: React.ReactNode;
}

/**
 * Locale provider component for managing app-wide locale state.
 * 
 * Features:
 * - Cookie and localStorage persistence
 * - SSR-safe initialization
 * - Automatic fallback to default locale
 * 
 * NOTE: This component does NOT handle redirects or browser language detection.
 * - URL locale is provided by [locale]/layout.tsx
 * - Language switching is handled by components using Next.js router
 * 
 * @param props - Component props
 * @returns Locale context provider
 * 
 * @example
 * // In [locale]/layout.tsx
 * <LocaleProvider initialLocale={locale}>
 *   <App />
 * </LocaleProvider>
 * 
 * // In components
 * const { locale, setLocale } = useLocale();
 * // To change locale, use Next.js router (handled by LanguageSwitcher)
 */
export function LocaleProvider({ initialLocale, children }: LocaleProviderProps): React.JSX.Element {
  // Initialize locale state with SSR-safe default
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    // Server-side: use initialLocale from URL params
    if (typeof window === 'undefined') {
      return getBestLocale(initialLocale);
    }
    
    // Client-side: trust initialLocale (it's already from the URL)
    // The [locale]/layout.tsx already extracted it from params
    return getBestLocale(initialLocale);
  });

  /**
   * Set locale with persistence.
   * Updates state, localStorage, and cookies.
   * 
   * NOTE: This does NOT navigate/redirect. Components should use Next.js router.
   * 
   * @param newLocale - Locale to set
   */
  const setLocale = useCallback((newLocale: SupportedLocale): void => {
    setLocaleState(newLocale);
    
    // Persist to localStorage and cookie
    saveLocaleToStorage(newLocale);
    saveLocaleToCookie(newLocale);
  }, []);

  /**
   * Sync locale to storage on mount.
   * Ensures the current locale is persisted.
   */
  useEffect(() => {
    // Persist current locale to storage
    const stored = getLocaleFromStorage();
    if (stored !== locale) {
      saveLocaleToStorage(locale);
      saveLocaleToCookie(locale);
    }
  }, [locale]);

  // Keep state in sync when the initialLocale prop changes (e.g., client-side navigation)
  useEffect(() => {
    const normalized = getBestLocale(initialLocale);
    setLocaleState(prev => (prev !== normalized ? normalized : prev));
  }, [initialLocale]);

  const contextValue: LocaleContextValue = {
    locale,
    setLocale,
  };

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Hook to access locale context.
 * 
 * Provides locale state and control functions.
 * Must be used within LocaleProvider.
 * 
 * @returns Locale context value
 * @throws Error if used outside LocaleProvider
 * 
 * @example
 * const { locale, setLocale } = useLocale();
 * 
 * // Change locale (note: does NOT navigate, use router for that)
 * setLocale('fr');
 */
export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  
  return context;
}
