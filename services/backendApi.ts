import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Category, CategoryProductsPage, Dupe, PriceOffer, Product } from './api';

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

export async function searchProductsFromBackend(query: string): Promise<Product[]> {
  const response = await fetch(`${BASE_URL}/products/search?q=${encodeURIComponent(query)}`);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

export async function getCategoriesFromBackend(): Promise<Category[]> {
  const response = await fetch(`${BASE_URL}/categories`);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  return JSON.parse(text);
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

  const response = await fetch(`${BASE_URL}/products/category/${encodeURIComponent(category)}?${params.toString()}`);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return {
      items: parsed,
      total: parsed.length,
      page: 1,
      pageSize: parsed.length || options.pageSize || 24,
      totalPages: 1,
    };
  }

  return parsed;
}


export async function getProductByIdFromBackend(id: string): Promise<Product | null> {
  const response = await fetch(`${BASE_URL}/products/${encodeURIComponent(id)}`);

  if (response.status === 404) {
    return null;
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

export async function findDupesFromBackend(product: Product): Promise<Dupe[]> {
  console.log('Sending product to backend:', product);
  console.log('Using backend URL:', BASE_URL);

  const response = await fetch(`${BASE_URL}/dupes`, {
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
  });

  const text = await response.text();
  console.log('Raw backend response:', text);

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  const data = JSON.parse(text);
  console.log('Parsed backend dupes:', data);

  return data;
}

export async function findPriceMatchesFromBackend(product: Product): Promise<PriceOffer[]> {
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

  return JSON.parse(text);
}
