import type { Category, DataService, Dupe, Product, ProductColor } from './api';
import { findDupesFromBackend, getProductByIdFromBackend, getProductsByCategoryFromBackend, searchProductsFromBackend } from './backendApi';

const BASE_URL = 'https://makeup-api.herokuapp.com/api/v1/products.json';

interface MakeupApiProduct {
  id: number;
  brand: string | null;
  name: string;
  price: string | null;
  price_sign: string | null;
  image_link: string;
  product_link: string;
  description: string | null;
  rating: number | null;
  category: string | null;
  product_type: string | null;
  tag_list: string[];
  product_colors: { hex_value: string; colour_name: string }[];
}

function transformProduct(raw: MakeupApiProduct): Product {
  const price = parseFloat(raw.price || '0');
  return {
    id: String(raw.id),
    name: raw.name || 'Unknown Product',
    brand: capitalize(raw.brand || 'Unknown'),
    price: isNaN(price) ? 0 : price,
    image: raw.image_link?.startsWith('//') ? `https:${raw.image_link}` : (raw.image_link || ''),
    rating: raw.rating ?? 0,
    category: raw.category || raw.product_type || 'general',
    productType: raw.product_type || 'general',
    description: raw.description || undefined,
    tags: raw.tag_list || [],
    colors: raw.product_colors
      ?.filter(c => c.hex_value)
      .slice(0, 8)
      .map((c): ProductColor => ({
        name: c.colour_name || 'Shade',
        hex: c.hex_value.startsWith('#') ? c.hex_value : `#${c.hex_value}`,
      })),
  };
}

function capitalize(str: string): string {
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function computeSimilarity(a: Product, b: Product): number {
  let score = 60;
  if (a.productType === b.productType) score += 15;
  if (a.category === b.category) score += 10;
  const aTags = new Set(a.tags || []);
  const bTags = new Set(b.tags || []);
  const shared = [...aTags].filter(t => bTags.has(t)).length;
  const total = new Set([...aTags, ...bTags]).size;
  if (total > 0) score += Math.round((shared / total) * 15);
  return Math.min(score, 99);
}

let productCache: Map<string, Product[]> = new Map();

async function fetchProducts(params: Record<string, string>): Promise<Product[]> {
  const key = JSON.stringify(params);
  if (productCache.has(key)) return productCache.get(key)!;

  const url = new URL(BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const raw: MakeupApiProduct[] = await res.json();
  const products = raw
    .filter(p => p.price && parseFloat(p.price) > 0)
    .map(transformProduct);

  productCache.set(key, products);
  return products;
}

export const makeupApiService: DataService = {
  async searchProducts(query: string): Promise<Product[]> {
    return searchProductsFromBackend(query);
  },

  async getProductsByCategory(category: string): Promise<Product[]> {
    return getProductsByCategoryFromBackend(category);
  },

  async getProductById(id: string): Promise<Product | null> {
    return getProductByIdFromBackend(id);
  },

  async findDupes(product: Product): Promise<Dupe[]> {
    return findDupesFromBackend(product);
  },

  async getCategories(): Promise<Category[]> {
    return [
      { id: 'eyes', name: 'Eyes', emoji: '', productType: 'eyes', color: '#FFF9F0' },
      { id: 'lips', name: 'Lips', emoji: '', productType: 'lips', color: '#FFE4F0' },
      { id: 'face', name: 'Face', emoji: '', productType: 'face', color: '#F7C6D9' },
      { id: 'skincare', name: 'Skincare', emoji: '', productType: 'skincare', color: '#FFF6F9' },
      { id: 'other', name: 'Other', emoji: '', productType: 'other', color: '#2A0B26' },
    ];
  },

  async getFeaturedDupes(): Promise<Dupe[]> {
    const [lipsticks, foundations, eyeshadows] = await Promise.all([
      fetchProducts({ product_type: 'lipstick' }).catch(() => []),
      fetchProducts({ product_type: 'foundation' }).catch(() => []),
      fetchProducts({ product_type: 'eyeshadow' }).catch(() => []),
    ]);

    const allProducts = [...lipsticks, ...foundations, ...eyeshadows];
    const expensive = allProducts
      .filter(p => p.price >= 15)
      .sort((a, b) => b.price - a.price)
      .slice(0, 6);

    const dupes: Dupe[] = [];
    for (const original of expensive) {
      const candidates = allProducts.filter(
        p => p.id !== original.id && p.productType === original.productType && p.price < original.price && p.price > 0
      );
      if (candidates.length === 0) continue;
      const bestDupe = candidates.reduce((best, c) => {
        const sim = computeSimilarity(original, c);
        return sim > computeSimilarity(original, best) ? c : best;
      });
      dupes.push({
        id: `featured-${original.id}-${bestDupe.id}`,
        original,
        dupe: bestDupe,
        similarity: computeSimilarity(original, bestDupe),
        savings: Math.round((original.price - bestDupe.price) * 100) / 100,
      });
    }

    return dupes.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  },
};
