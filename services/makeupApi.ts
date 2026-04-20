import type { Category, DataService, Dupe, Product } from './api';
import {
  findDupesFromBackend,
  findPriceMatchesFromBackend,
  getCategoriesFromBackend,
  getProductByIdFromBackend,
  getProductsByCategoryFromBackend,
  searchProductsFromBackend,
  searchProductsPageFromBackend,
} from './backendApi';

const FEATURED_DUPES_TTL_MS = 5 * 60_000;
let featuredDupesCache: { expiresAt: number; value: Dupe[] } | null = null;

function sortFeaturedCandidates(products: Product[]) {
  return products
    .filter(product => product.price > 0 && Boolean(product.image))
    .sort((left, right) => {
      const leftScore = (left.rating * 100) + left.price;
      const rightScore = (right.rating * 100) + right.price;
      return rightScore - leftScore;
    });
}

function pickFeaturedCandidates(products: Product[], maxCount = 6) {
  const unique = new Map<string, Product>();

  for (const product of sortFeaturedCandidates(products)) {
    const key = product.variantGroupId || product.id;
    if (!unique.has(key)) {
      unique.set(key, product);
    }
    if (unique.size >= maxCount) {
      break;
    }
  }

  return [...unique.values()];
}

async function loadFeaturedDupesFromBackend(): Promise<Dupe[]> {
  const categoryPages = await Promise.all([
    getProductsByCategoryFromBackend('lips', { page: 1, pageSize: 12, sort: 'popular' }).catch(() => null),
    getProductsByCategoryFromBackend('face', { page: 1, pageSize: 12, sort: 'popular' }).catch(() => null),
    getProductsByCategoryFromBackend('eyes', { page: 1, pageSize: 12, sort: 'popular' }).catch(() => null),
  ]);

  const candidates = pickFeaturedCandidates(
    categoryPages.flatMap(page => page?.items || []),
    6,
  );

  const featured = await Promise.all(
    candidates.map(async original => {
      const dupes = await findDupesFromBackend(original).catch(() => []);
      const bestDupe = dupes[0];
      if (!bestDupe) {
        return null;
      }

      return {
        ...bestDupe,
        id: `featured-${original.id}-${bestDupe.dupe.id}`,
      } satisfies Dupe;
    }),
  );

  return featured
    .filter((item): item is Dupe => Boolean(item))
    .sort((left, right) => right.similarity - left.similarity || right.savings - left.savings)
    .slice(0, 5);
}

export const makeupApiService: DataService = {
  async searchProducts(query: string, options?: { limit?: number; signal?: AbortSignal }): Promise<Product[]> {
    return searchProductsFromBackend(query, options);
  },

  async searchProductsPage(query: string, options) {
    return searchProductsPageFromBackend(query, options);
  },

  async getProductsByCategory(category: string, options) {
    return getProductsByCategoryFromBackend(category, options);
  },

  async getProductById(id: string): Promise<Product | null> {
    return getProductByIdFromBackend(id);
  },

  async findDupes(product: Product): Promise<Dupe[]> {
    return findDupesFromBackend(product);
  },

  async findPriceMatches(product: Product) {
    return findPriceMatchesFromBackend(product);
  },

  async getCategories(): Promise<Category[]> {
    return getCategoriesFromBackend();
  },

  async getFeaturedDupes(): Promise<Dupe[]> {
    if (featuredDupesCache && Date.now() < featuredDupesCache.expiresAt) {
      return featuredDupesCache.value;
    }

    const featured = await loadFeaturedDupesFromBackend();
    featuredDupesCache = {
      value: featured,
      expiresAt: Date.now() + FEATURED_DUPES_TTL_MS,
    };
    return featured;
  },
};
