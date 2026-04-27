import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@duply_preferences';

type PreferencesState = {
  showHigherPricedMatches: boolean;
  excludeSameBrandDupes: boolean;
};

export interface PreferencesContextValue extends PreferencesState {
  loaded: boolean;
  setShowHigherPricedMatches: (value: boolean) => void;
  setExcludeSameBrandDupes: (value: boolean) => void;
}

const DEFAULT_PREFERENCES: PreferencesState = {
  showHigherPricedMatches: false,
  excludeSameBrandDupes: true,
};

export const PreferencesContext = createContext<PreferencesContextValue>({
  ...DEFAULT_PREFERENCES,
  loaded: false,
  setShowHigherPricedMatches: () => {},
  setExcludeSameBrandDupes: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<PreferencesState>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  const persist = useCallback(async (nextState: PreferencesState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // Best-effort persistence only.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (!json) {
          return;
        }

        const parsed = JSON.parse(json) as Partial<PreferencesState>;
        setPreferences({
          showHigherPricedMatches: Boolean(parsed.showHigherPricedMatches),
          excludeSameBrandDupes: parsed.excludeSameBrandDupes !== undefined
            ? Boolean(parsed.excludeSameBrandDupes)
            : DEFAULT_PREFERENCES.excludeSameBrandDupes,
        });
      } catch {
        // Storage unavailable.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setShowHigherPricedMatches = useCallback((value: boolean) => {
    setPreferences(prev => {
      const nextState = { ...prev, showHigherPricedMatches: value };
      void persist(nextState);
      return nextState;
    });
  }, [persist]);

  const setExcludeSameBrandDupes = useCallback((value: boolean) => {
    setPreferences(prev => {
      const nextState = { ...prev, excludeSameBrandDupes: value };
      void persist(nextState);
      return nextState;
    });
  }, [persist]);

  return (
    <PreferencesContext.Provider
      value={{
        ...preferences,
        loaded,
        setShowHigherPricedMatches,
        setExcludeSameBrandDupes,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}
