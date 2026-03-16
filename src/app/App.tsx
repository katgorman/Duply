import { HomeScreen } from './screens/HomeScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SearchResultsScreen } from './screens/SearchResultsScreen';
import { ProductDetailScreen } from './screens/ProductDetailScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';

export default function App() {
  return (
    <div className="flex gap-8 p-8 bg-gray-100 min-h-screen overflow-x-auto">
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Home</p>
        <HomeScreen />
      </div>
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Categories</p>
        <CategoriesScreen />
      </div>
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Search</p>
        <SearchScreen />
      </div>
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Search Results</p>
        <SearchResultsScreen />
      </div>
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Product Detail</p>
        <ProductDetailScreen />
      </div>
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Favorites</p>
        <FavoritesScreen />
      </div>
      <div className="flex-shrink-0">
        <p className="text-center mb-2 font-semibold text-gray-700">Profile</p>
        <ProfileScreen />
      </div>
    </div>
  );
}