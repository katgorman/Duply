import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Category, CategoryProductsPage, Dupe, PriceOffer, Product } from './api';
import { findFamilyVariants, groupCategoryProductsPage, groupProductsByFamily, withVariantOptions } from './productFamilies';

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

function sanitizeBaseUrl(value: string | undefined | null): string {
  const trimmed = (value || '').trim();
  return trimmed.replace(/\/+$/, '');
}

function getBackendBaseUrl(): string {
  const publicEnvUrl = sanitizeBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    (Constants.expoConfig as any)?.extra?.apiBaseUrl
  );

  if (publicEnvUrl) {
    return publicEnvUrl;
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
  if (product.variantOptions?.length) {
    product.variantOptions.forEach(variant => {
      if (variant.id) {
        setCachedValue(`product:${variant.id}`, product, CACHE_TTL_MS.product);
      }
    });
  }
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
    id: product.id,
    brand: product.brand,
    name: product.name,
    price: product.price,
    image: product.image,
    category: product.category,
    productType: product.productType,
    productUrl: product.productUrl,
  };
  return `priceMatches:${JSON.stringify(payload)}`;
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

export function getCachedProductById(id: string) {
  return getCachedValue<Product | null>(`product:${id}`);
}

export function getCachedDupesForProduct(product: Product | null | undefined) {
  if (!product) return null;
  return getCachedValue<Dupe[]>(buildDupesCacheKey(product));
}

export function getCachedPriceMatchesForProduct(product: Product | null | undefined) {
  if (!product) return null;
  return getCachedValue<PriceOffer[]>(buildPriceMatchesCacheKey(product));
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
    const response = await fetch(url, options);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Backend error ${response.status}: ${text}`);
    }

    const parsed = JSON.parse(text) as T;
    setCachedValue(cacheKey, parsed, ttlMs);
    return parsed;
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

export async function searchProductsFromBackend(query: string, options: { limit?: number } = {}): Promise<Product[]> {
  const trimmed = query.trim().toLowerCase();
  const params = new URLSearchParams({
    q: query,
    limit: String(options.limit || 8),
  });
  const url = `${BASE_URL}/products/search?${params.toString()}`;
  const products = await fetchJsonWithCache<Product[]>(url, undefined, `search:${trimmed}:${options.limit || 8}`, CACHE_TTL_MS.search);
  return groupProductsByFamily(products);
}

export async function searchProductsPageFromBackend(
  query: string,
  options: { page?: number; pageSize?: number; sort?: string } = {},
): Promise<CategoryProductsPage> {
  const page = await fetchSearchProductsPageRaw(query, options);
  const grouped = groupCategoryProductsPage(page);
  seedProductsCache(grouped.items);
  return grouped;
}

export async function getCategoriesFromBackend(): Promise<Category[]> {
  const url = `${BASE_URL}/categories`;
  return fetchJsonWithCache<Category[]>(url, undefined, 'categories', CACHE_TTL_MS.categories);
}

export async function getProductsByCategoryFromBackend(
  category: string,
  options: { page?: number; pageSize?: number; query?: string; sort?: string } = {},
): Promise<CategoryProductsPage> {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    page_size: String(options.pageSize || 24),
    sort: options.sort || 'popular',
  });
  if (options.query?.trim()) {
    params.set('q', options.query.trim());
  }

  const url = `${BASE_URL}/products/category/${encodeURIComponent(category)}?${params.toString()}`;
  const parsed = await fetchJsonWithCache<CategoryProductsPage | Product[]>(
    url,
    undefined,
    buildCategoryCacheKey(category, options),
    CACHE_TTL_MS.categoryProducts
  );
  if (Array.isArray(parsed)) {
    const grouped = groupCategoryProductsPage({
      items: parsed,
      total: parsed.length,
      page: 1,
      pageSize: parsed.length || options.pageSize || 24,
      totalPages: 1,
    });
    seedProductsCache(grouped.items);
    return grouped;
  }

  const grouped = groupCategoryProductsPage(parsed);
  seedProductsCache(grouped.items);
  return grouped;
}


export async function getProductByIdFromBackend(id: string): Promise<Product | null> {
  const cacheKey = `product:${id}`;
  const cached = getCachedValue<Product | null>(cacheKey);
  if (cached !== null) {
    return cached;
  }

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
  let normalized = parsed;

  const variantQuery = [parsed.brand, parsed.name].filter(Boolean).join(' ').trim();
  if (variantQuery) {
    try {
      const related = await fetchSearchProductsPageRaw(variantQuery, { page: 1, pageSize: 40, sort: 'popular' });
      const siblings = findFamilyVariants(parsed, related.items);
      if (siblings.length > 1) {
        normalized = withVariantOptions(parsed, siblings);
      }
    } catch {
      // Best-effort variant lookup only.
    }
  }

  seedProductFamilyCaches(normalized);
  return normalized;
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
  const cached = getCachedValue<PriceOffer[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const response = await fetch(`${BASE_URL}/products/price-matches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: product.id,
      brand: product.brand,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      productType: product.productType,
      productUrl: product.productUrl,
    }),
  });

  const text = await response.text();

  if (response.status === 404 || response.status === 405) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  const parsed = JSON.parse(text) as PriceOffer[];
  setCachedValue(cacheKey, parsed, CACHE_TTL_MS.priceMatches);
  return parsed;
}
