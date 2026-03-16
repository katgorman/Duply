import { Heart } from "lucide-react";
import { Link } from "react-router";
import { Layout } from "./Layout";

export function Favorites() {
  // In a real app, this would come from state management or local storage
  const favorites: any[] = [];

  return (
    <Layout>
      <div className="h-full bg-gradient-to-b from-pink-50 to-white overflow-y-auto">
        {/* Content */}
        <div className="px-4 py-8">
          {favorites.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No favorites yet</p>
              <p className="text-sm text-gray-400">
                Tap the heart icon on any dupe to save it here
              </p>
              <Link 
                to="/"
                className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full font-medium"
              >
                Browse Dupes
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Favorite items would be rendered here */}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}