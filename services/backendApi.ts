import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Category, CategoryProductsPage, Dupe, PriceOffer, Product } from './api';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = {
  search: 60_000,
  categories: 5 * 60_000,
  categoryProducts: 90_000,
  product: 5 * 60_000,
  dupes: 2 * 60_000,
  priceMatches: 90_000,
} as const;

const HOSTED_BACKEND_FALLBACK_URL = 'https://duply-backend-835k.onrender.com';

function sanitizeBaseUrl(value: string | undefined | null): string {
  const trimmed = (value || '').trim();
  return trimmed.replace(/\/+$/, '');
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname.endsWith('.local');
}

function getBackendBaseUrl(): string {
  const publicEnvUrl = sanitizeBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    (Constants.expoConfig as any)?.extra?.apiBaseUrl
  );

  if (publicEnvUrl) {
    return publicEnvUrl;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const browserHost = window.location.hostname || '';
    if (isLocalHostname(browserHost)) {
      return `http://${browserHost}:8000`;
    }
    return HOSTED_BACKEND_FALLBACK_URL;
  }

  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost ||
    '';

  const derivedHost = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';

  if (derivedHost) {
    return `http://${derivedHost}:8000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
}

const BASE_URL = getBackendBaseUrl();
const responseCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();
const MAX_CACHE_ENTRIES = 200;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const REQUEST_RETRY_DELAY_MS = 450;

function buildCategoryCacheKey(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
) {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    page_size: String(options.pageSize || 24),
    sort: options.sort || 'popular',
  });
  if (options.query?.trim()) {
    params.set('q', options.query.trim());
  }
  return `category:${category}:${params.toString()}`;
}

function buildSearchPageCacheKey(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
) {
  const params = new URLSearchParams({
    q: query,
    page: String(options.page || 1),
    page_size: String(options.pageSize || 24),
    sort: options.sort || 'popular',
  });
  return `search-page:${query.trim().toLowerCase()}:${params.toString()}`;
}

function seedProductFamilyCaches(product: Product) {
  if (!product?.id) return;
  setCachedValue(`product:${product.id}`, product, CACHE_TTL_MS.product);
}

function seedProductsCache(products: Product[]) {
  products.forEach(seedProductFamilyCaches);
}

function getCachedPage<T>(key: string) {
  return getCachedValue<T>(key);
}

function buildDupesCacheKey(product: Product) {
  const payload = {
    brand: product.brand,
    name: product.name,
    price: product.price,
    image: product.image,
    category: product.category,
    productType: product.productType,
  };
  return `dupes:${JSON.stringify(payload)}`;
}

function buildPriceMatchesCacheKey(product: Product) {
  const payload = {
    variantGroupId: product.variantGroupId || '',
    brand: (product.brand || '').trim().toLowerCase(),
    name: (product.name || '').trim().toLowerCase(),
    familyName: (product.familyName || product.name || '').trim().toLowerCase(),
    category: (product.category || '').trim().toLowerCase(),
    productType: (product.productType || '').trim().toLowerCase(),
    productUrl: (product.productUrl || '').trim().toLowerCase(),
  };
  return `priceMatches:${JSON.stringify(payload)}`;
}

function isSupportedPriceMatchUrl(url: string | undefined | null): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if ((hostname === 'www.sephora.com' || hostname === 'sephora.com') && /^\/product\/[^?#]+$/i.test(pathname)) {
      return true;
    }

    if ((hostname === 'www.ulta.com' || hostname === 'ulta.com') && /^\/p\/[^?#]+$/i.test(pathname)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function sanitizePriceOffers(offers: PriceOffer[] | null | undefined): PriceOffer[] {
  return (offers || [])
    .filter(offer => {
      const url = (offer?.url || '').trim();
      return Number.isFinite(offer?.price) && (offer?.price || 0) > 0 && isSupportedPriceMatchUrl(url);
    })
    .sort((left, right) => {
      const leftPrice = left.price || Number.MAX_SAFE_INTEGER;
      const rightPrice = right.price || Number.MAX_SAFE_INTEGER;
      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }
      const confidenceDelta = (right.matchConfidence || 0) - (left.matchConfidence || 0);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return (left.retailer || '').localeCompare(right.retailer || '');
    });
}

export function getCachedCategoryPage(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
) {
  return getCachedPage<CategoryProductsPage>(buildCategoryCacheKey(category, options));
}

export function getCachedSearchProductsPage(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
) {
  return getCachedPage<CategoryProductsPage>(buildSearchPageCacheKey(query, options));
}

export function getCachedSearchResults(query: string, limit = 8) {
  return getCachedValue<Product[]>(`search:${query.trim().toLowerCase()}:${limit}`);
}

export function getCachedProductById(id: string) {
  return getCachedValue<Product | null>(`product:${id}`);
}

export function getCachedDupesForProduct(product: Product | null | undefined) {
  if (!product) return null;
  return getCachedValue<Dupe[]>(buildDupesCacheKey(product));
}

export function getCachedPriceMatchesForProduct(product: Product | null | undefined) {
  if (!product) return null;
  const cacheKey = buildPriceMatchesCacheKey(product);
  const cached = getCachedValue<PriceOffer[]>(cacheKey);
  if (cached === null) {
    return null;
  }
  const sanitized = sanitizePriceOffers(cached);
  if (sanitized.length !== cached.length) {
    setCachedValue(cacheKey, sanitized, CACHE_TTL_MS.priceMatches);
  }
  return sanitized;
}

function getCachedValue<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }

  return entry.value as T;
}

function setCachedValue<T>(key: string, value: T, ttlMs: number) {
  if (!responseCache.has(key) && responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) {
      responseCache.delete(oldestKey);
    }
  }

  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function seedProductCache(product: Product | null | undefined) {
  if (!product?.id) return;
  seedProductFamilyCaches(product);
}

export async function prefetchProductById(id: string) {
  if (!id) return;
  try {
    await getProductByIdFromBackend(id);
  } catch {
    // Best-effort cache warming.
  }
}

export function prefetchProductsById(ids: string[]) {
  ids
    .filter(Boolean)
    .forEach(id => {
      void prefetchProductById(id);
    });
}

export function prefetchCategoryPage(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
) {
  if (!category) return;
  void getProductsByCategoryFromBackend(category, options).catch(() => {
    // Best-effort cache warming only.
  });
}

export function prefetchSearchProductsPage(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
) {
  if (!query.trim()) return;
  void searchProductsPageFromBackend(query, options).catch(() => {
    // Best-effort cache warming only.
  });
}

export function prefetchDupesForProduct(product: Product | null | undefined) {
  if (!product) return;
  void findDupesFromBackend(product).catch(() => {
    // Best-effort cache warming only.
  });
}

export function prefetchPriceMatchesForProduct(product: Product | null | undefined) {
  if (!product) return;
  void findPriceMatchesFromBackend(product).catch(() => {
    // Best-effort cache warming only.
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isRetryableRequestError(error: unknown) {
  if (isAbortError(error)) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    /Backend error 50[234]/i.test(message)
    || /Failed to fetch/i.test(message)
    || /Network request failed/i.test(message)
    || /Load failed/i.test(message)
  );
}

function normalizeRequestError(error: unknown) {
  if (error instanceof Error) {
    if (isRetryableRequestError(error)) {
      return new Error('The server is waking up or temporarily unavailable. Please try again.');
    }
    return error;
  }

  if (typeof error === 'string' && /50[234]|failed to fetch|network request failed/i.test(error)) {
    return new Error('The server is waking up or temporarily unavailable. Please try again.');
  }

  return new Error(String(error));
}

async function fetchTextWithRetry(url: string, options?: RequestInit) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();

      if (!response.ok) {
        const backendError = new Error(`Backend error ${response.status}: ${text}`);
        if (attempt === 0 && RETRYABLE_STATUS_CODES.has(response.status)) {
          lastError = backendError;
          await sleep(REQUEST_RETRY_DELAY_MS);
          continue;
        }
        throw backendError;
      }

      return text;
    } catch (error) {
      if (attempt === 0 && isRetryableRequestError(error)) {
        lastError = error;
        await sleep(REQUEST_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch');
}

async function fetchJsonWithCache<T>(url: string, options: RequestInit | undefined, cacheKey: string, ttlMs: number): Promise<T> {
  const cached = getCachedValue<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const request = (async () => {
    try {
      const text = await fetchTextWithRetry(url, options);
      const parsed = JSON.parse(text) as T;
      setCachedValue(cacheKey, parsed, ttlMs);
      return parsed;
    } catch (error) {
      throw normalizeRequestError(error);
    }
  })();

  inflightRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

async function fetchSearchProductsPageRaw(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
): Promise<CategoryProductsPage> {
  const params = new URLSearchParams({
    q: query,
    page: String(options.page || 1),
    page_size: String(options.pageSize || 24),
    sort: options.sort || 'popular',
  });

  const url = `${BASE_URL}/products/search-page?${params.toString()}`;
  return fetchJsonWithCache<CategoryProductsPage>(
    url,
    undefined,
    buildSearchPageCacheKey(query, options),
    CACHE_TTL_MS.categoryProducts,
  );
}

async function fetchCategoryProductsPageRaw(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
): Promise<CategoryProductsPage | Product[]> {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    page_size: String(options.pageSize || 24),
    sort: options.sort || 'popular',
  });
  if (options.query?.trim()) {
    params.set('q', options.query.trim());
  }

  const url = `${BASE_URL}/products/category/${encodeURIComponent(category)}?${params.toString()}`;
  return fetchJsonWithCache<CategoryProductsPage | Product[]>(
    url,
    undefined,
    buildCategoryCacheKey(category, options),
    CACHE_TTL_MS.categoryProducts,
  );
}

function normalizeRawCategoryPage(
  parsed: CategoryProductsPage | Product[],
  fallbackPage = 1,
  fallbackPageSize = 24,
): CategoryProductsPage {
  if (Array.isArray(parsed)) {
    return {
      items: parsed,
      total: parsed.length,
      page: fallbackPage,
      pageSize: parsed.length || fallbackPageSize,
      totalPages: 1,
    };
  }

  return parsed;
}

export async function searchProductsFromBackend(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<Product[]> {
  const trimmed = query.trim().toLowerCase();
  const params = new URLSearchParams({
    q: query,
    limit: String(options.limit || 8),
  });
  const url = `${BASE_URL}/products/search?${params.toString()}`;
  const products = await fetchJsonWithCache<Product[]>(
    url,
    options.signal ? { signal: options.signal } : undefined,
    `search:${trimmed}:${options.limit || 8}`,
    CACHE_TTL_MS.search,
  );
  seedProductsCache(products);
  return products;
}

export async function searchProductsPageFromBackend(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
): Promise<CategoryProductsPage> {
  const page = await fetchSearchProductsPageRaw(query, options);
  seedProductsCache(page.items);
  return page;
}

export async function getCategoriesFromBackend(): Promise<Category[]> {
  const url = `${BASE_URL}/categories`;
  return fetchJsonWithCache<Category[]>(url, undefined, 'categories', CACHE_TTL_MS.categories);
}

export async function getProductsByCategoryFromBackend(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
): Promise<CategoryProductsPage> {
  const parsed = await fetchCategoryProductsPageRaw(category, options);
  const page = normalizeRawCategoryPage(parsed, options.page || 1, options.pageSize || 24);
  seedProductsCache(page.items);
  return page;
}


export async function getProductByIdFromBackend(id: string): Promise<Product | null> {
  const cacheKey = `product:${id}`;
  const cached = getCachedValue<Product | null>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight as Promise<Product | null>;
  }

  const request = (async () => {
    const response = await fetch(`${BASE_URL}/products/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      setCachedValue(cacheKey, null, CACHE_TTL_MS.product);
      return null;
    }

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Backend error ${response.status}: ${text}`);
    }

    const parsed = JSON.parse(text) as Product;
    seedProductFamilyCaches(parsed);
    return parsed;
  })();

  inflightRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

export async function findDupesFromBackend(product: Product): Promise<Dupe[]> {
  const cacheKey = buildDupesCacheKey(product);
  return fetchJsonWithCache<Dupe[]>(`${BASE_URL}/dupes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand: product.brand,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      productType: product.productType,
    }),
  }, cacheKey, CACHE_TTL_MS.dupes);
}

export async function findPriceMatchesFromBackend(product: Product): Promise<PriceOffer[]> {
  const cacheKey = buildPriceMatchesCacheKey(product);
  return fetchJsonWithCache<PriceOffer[]>(`${BASE_URL}/products/price-matches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: product.id,
      brand: product.brand,
      name: product.name,
      familyName: product.familyName,
      price: product.price,
      image: product.image,
      category: product.category,
      productType: product.productType,
      productUrl: product.productUrl,
    }),
  }, cacheKey, CACHE_TTL_MS.priceMatches).then(offers => {
    const sanitized = sanitizePriceOffers(offers);
    setCachedValue(cacheKey, sanitized, CACHE_TTL_MS.priceMatches);
    return sanitized;
  }).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Backend error 404')
      || message.includes('Backend error 405')
      || message.includes('temporarily unavailable')
    ) {
      setCachedValue(cacheKey, [], CACHE_TTL_MS.priceMatches);
      return [];
    }
    throw error;
  });
}
