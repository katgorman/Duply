import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category, CategoryProductsPage, Dupe, Product } from '../services/api';
import {
  dataService,
  getCachedCategoryPage,
  getCachedSearchResults,
  getCachedSearchProductsPage,
} from '../services/api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsync<T>(fetcher: () => Promise<T>, deps: any[] = [], initialData: T | null = null) {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: true,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const depsKey = JSON.stringify(deps);
  const initialDataRef = useRef(initialData);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({
      data: prev.data ?? initialDataRef.current,
      loading: true,
      error: null,
    }));
    fetcherRef.current()
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => { cancelled = true; };
  }, [depsKey]);

  return state;
}

export function useFeaturedDupes() {
  return useAsync<Dupe[]>(() => dataService.getFeaturedDupes(), []);
}

export function useCategories() {
  return useAsync<Category[]>(() => dataService.getCategories(), []);
}

export function useProductsByCategory(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
) {
  const cachedPage = getCachedCategoryPage(category, options);
  return useAsync<CategoryProductsPage>(
    () => dataService.getProductsByCategory(category, options),
    [category, options.page, options.pageSize, options.query, options.sort],
    cachedPage,
  );
}

export function useProductSearchResults(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
) {
  const cachedPage = query.trim().length >= 2
    ? getCachedSearchProductsPage(query, options)
    : {
        items: [],
        total: 0,
        page: options.page || 1,
        pageSize: options.pageSize || 24,
        totalPages: 1,
      };
  return useAsync<CategoryProductsPage>(
    () => (
      query.trim().length < 2
        ? Promise.resolve({
            items: [],
            total: 0,
            page: options.page || 1,
            pageSize: options.pageSize || 24,
            totalPages: 1,
          })
        : dataService.searchProductsPage(query, options)
    ),
    [query, options.page, options.pageSize, options.sort],
    cachedPage,
  );
}

export function useProduct(id: string) {
  return useAsync<Product | null>(
    () => dataService.getProductById(id),
    [id],
  );
}

export function useDupes(product: Product | null) {
  return useAsync<Dupe[]>(
    () => (product ? dataService.findDupes(product) : Promise.resolve([])),
    [product?.id],
  );
}

export function useSearch() {
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const cacheRef = useRef(new Map<string, Product[]>());

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    abortRef.current = null;

    const trimmedQuery = query.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const cached = cacheRef.current.get(normalizedQuery);
    if (cached) {
      setResults(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const cachedBackendResults = getCachedSearchResults(trimmedQuery, 8);
    if (cachedBackendResults?.length) {
      cacheRef.current.set(normalizedQuery, cachedBackendResults);
      setResults(cachedBackendResults);
      setLoading(false);
      setError(null);
      return;
    }

    const cachedPage = getCachedSearchProductsPage(trimmedQuery, { page: 1, pageSize: 18, sort: 'popular' });
    if (cachedPage?.items?.length) {
      const seededResults = cachedPage.items.slice(0, 8);
      cacheRef.current.set(normalizedQuery, seededResults);
      setResults(seededResults);
      setError(null);
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await dataService.searchProducts(trimmedQuery, {
          limit: 8,
          signal: controller.signal,
        });

        if (requestId !== requestIdRef.current) return;

        cacheRef.current.set(normalizedQuery, data);
        setResults(data);
        setError(null);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        if (requestId !== requestIdRef.current) return;
        setError(err.message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 250);
  }, []);

  return { results, loading, error, search };
}
