import type { Category, DataService, Dupe, Product } from './api';

/**
 * Legacy stub kept only as a placeholder.
 *
 * The app now talks to the local FastAPI backend, which in turn
 * used an older cloud-backed catalog path and recommendation model.
 */
export const firebaseApiService: DataService = {
  async searchProducts(_query: string): Promise<Product[]> {
    throw new Error('Use the backend-backed data service instead of firebaseApiService');
  },

  async getProductsByCategory(_category: string): Promise<Product[]> {
    throw new Error('Use the backend-backed data service instead of firebaseApiService');
  },

  async getProductById(_id: string): Promise<Product | null> {
    throw new Error('Use the backend-backed data service instead of firebaseApiService');
  },

  async findDupes(_product: Product): Promise<Dupe[]> {
    throw new Error('Use the backend-backed data service instead of firebaseApiService');
  },

  async getCategories(): Promise<Category[]> {
    throw new Error('Use the backend-backed data service instead of firebaseApiService');
  },

  async getFeaturedDupes(): Promise<Dupe[]> {
    throw new Error('Use the backend-backed data service instead of firebaseApiService');
  },
};
