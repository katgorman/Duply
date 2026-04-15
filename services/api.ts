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
  tags?: string[];
  colors?: ProductColor[];
}

export interface ProductColor {
  name: string;
  hex: string;
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
}

export interface DataService {
  searchProducts(query: string): Promise<Product[]>;
  getProductsByCategory(category: string): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  findDupes(product: Product): Promise<Dupe[]>;
  getCategories(): Promise<Category[]>;
  getFeaturedDupes(): Promise<Dupe[]>;
}

// The app uses the local backend service, which handles product catalog lookups
// and model-powered dupe lookup behind a single data service interface.
export { makeupApiService as dataService } from './makeupApi';
