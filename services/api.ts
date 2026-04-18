export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  rating: number;
  category: string;
  productType: string;
  countryOfOrigin?: string;
  crueltyFree?: string;
  genderTarget?: string;
  mainIngredient?: string;
  numberOfReviews?: number;
  packagingType?: string;
  productSize?: string;
  skinType?: string;
  description?: string;
  source?: 'catalog' | 'web';
  productUrl?: string;
  releaseYear?: number;
  tags?: string[];
  colors?: ProductColor[];
  familyName?: string;
  variantGroupId?: string;
  selectedVariantLabel?: string;
  variantOptions?: ProductVariantOption[];
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductVariantOption {
  id: string;
  label: string;
  image: string;
  price: number;
}

export interface PriceOffer {
  id: string;
  retailer: string;
  title: string;
  price: number;
  url: string;
  image?: string;
  shipping?: string;
  source?: string;
  matchConfidence?: number;
}

export interface Dupe {
  id: string;
  original: Product;
  dupe: Product;
  similarity: number;
  matchReason?: string;
  savings: number;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  productType: string;
  color: string;
  count?: number;
}

export interface CategoryProductsPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DataService {
  searchProducts(query: string, options?: { limit?: number }): Promise<Product[]>;
  searchProductsPage(query: string, options?: { page?: number; pageSize?: number; sort?: string }): Promise<CategoryProductsPage>;
  getProductsByCategory(category: string, options?: { page?: number; pageSize?: number; query?: string; sort?: string }): Promise<CategoryProductsPage>;
  getProductById(id: string): Promise<Product | null>;
  findDupes(product: Product): Promise<Dupe[]>;
  findPriceMatches(product: Product): Promise<PriceOffer[]>;
  getCategories(): Promise<Category[]>;
  getFeaturedDupes(): Promise<Dupe[]>;
}

// The app uses the local backend service, which handles product catalog lookups
// and model-powered dupe lookup behind a single data service interface.
export { makeupApiService as dataService } from './makeupApi';
export {
  getCachedDupesForProduct,
  getCachedCategoryPage,
  getCachedPriceMatchesForProduct,
  getCachedProductById,
  getCachedSearchProductsPage,
  prefetchCategoryPage,
  prefetchDupesForProduct,
  prefetchProductById,
  prefetchProductsById,
  prefetchPriceMatchesForProduct,
  prefetchSearchProductsPage,
  seedProductCache,
} from './backendApi';
