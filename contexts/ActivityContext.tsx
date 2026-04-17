import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { Product } from '../services/api';
import { getProductByIdFromBackend } from '../services/backendApi';

const SEARCHES_KEY = '@duply_recent_searches';
const VIEWS_KEY = '@duply_recent_views';

export interface ActivityContextValue {
  recentSearches: string[];
  recentViews: Product[];
  loaded: boolean;
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  addRecentView: (product: Product) => void;
  removeRecentView: (productId: string) => void;
}

export const ActivityContext = createContext<ActivityContextValue>({
  recentSearches: [],
  recentViews: [],
  loaded: false,
  addRecentSearch: () => {},
  removeRecentSearch: () => {},
  clearRecentSearches: () => {},
  addRecentView: () => {},
  removeRecentView: () => {},
});

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentViews, setRecentViews] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [searchesJson, viewsJson] = await Promise.all([
          AsyncStorage.getItem(SEARCHES_KEY),
          AsyncStorage.getItem(VIEWS_KEY),
        ]);

        if (searchesJson) {
          setRecentSearches(JSON.parse(searchesJson));
        }

        if (viewsJson) {
          const parsedViews = JSON.parse(viewsJson) as Product[];
          const validViews = await Promise.all(
            parsedViews.slice(0, 12).map(async product => {
              if (!product?.id) return null;
              try {
                return await getProductByIdFromBackend(product.id);
              } catch {
                return product;
              }
            })
          );
          const sanitizedViews = validViews.filter((product): product is Product => Boolean(product));
          setRecentViews(sanitizedViews);
          if (sanitizedViews.length !== parsedViews.length) {
            void AsyncStorage.setItem(VIEWS_KEY, JSON.stringify(sanitizedViews));
          }
        }
      } catch {
        // Storage unavailable
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persistSearches = useCallback(async (items: string[]) => {
    try {
      await AsyncStorage.setItem(SEARCHES_KEY, JSON.stringify(items));
    } catch {
      // Persist error
    }
  }, []);

  const persistViews = useCallback(async (items: Product[]) => {
    try {
      await AsyncStorage.setItem(VIEWS_KEY, JSON.stringify(items));
    } catch {
      // Persist error
    }
  }, []);

  const addRecentSearch = useCallback((query: string) => {
    const value = query.trim();
    if (!value) return;

    setRecentSearches(prev => {
      const updated = [value, ...prev.filter(item => item !== value)].slice(0, 10);
      persistSearches(updated);
      return updated;
    });
  }, [persistSearches]);

  const removeRecentSearch = useCallback((query: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(item => item !== query);
      persistSearches(updated);
      return updated;
    });
  }, [persistSearches]);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches(() => {
      persistSearches([]);
      return [];
    });
  }, [persistSearches]);

  const addRecentView = useCallback((product: Product) => {
    if (!product?.id) return;

    setRecentViews(prev => {
      const updated = [product, ...prev.filter(item => item.id !== product.id)].slice(0, 12);
      persistViews(updated);
      return updated;
    });
  }, [persistViews]);

  const removeRecentView = useCallback((productId: string) => {
    setRecentViews(prev => {
      const updated = prev.filter(item => item.id !== productId);
      persistViews(updated);
      return updated;
    });
  }, [persistViews]);

  return (
    <ActivityContext.Provider
      value={{
        recentSearches,
        recentViews,
        loaded,
        addRecentSearch,
        removeRecentSearch,
        clearRecentSearches,
        addRecentView,
        removeRecentView,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}
