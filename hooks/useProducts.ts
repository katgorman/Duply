import { useCallback, useEffect, useRef, useState } from 'react';
import type { Category, CategoryProductsPage, Dupe, Product } from '../services/api';
import { dataService, prefetchProductsById, seedProductCache } from '../services/api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsync<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));
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
  return useAsync<CategoryProductsPage>(
    () => dataService.getProductsByCategory(category, options),
    [category, options.page, options.pageSize, options.query, options.sort],
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
  const requestIdRef = useRef(0);
  const cacheRef = useRef(new Map<string, Product[]>());

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

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

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await dataService.searchProducts(trimmedQuery);
        if (requestId !== requestIdRef.current) return;
        data.slice(0, 4).forEach(seedProductCache);
        prefetchProductsById(data.slice(0, 4).map(product => product.id));
        cacheRef.current.set(normalizedQuery, data);
        setResults(data);
        setError(null);
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        setError(err.message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 180);
  }, []);

  return { results, loading, error, search };
}
