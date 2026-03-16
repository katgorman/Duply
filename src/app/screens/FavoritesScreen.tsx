import { Heart, Home, User } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function FavoritesScreen() {
  return (
    <PhoneFrame>
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Top Bar */}
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg" style={{ borderBottom: '1px solid #ff99a0' }}>
          <div className="px-4 pt-12 pb-3 flex items-center justify-center">
            <h1 className="text-xl font-bold" style={{ color: '#820933' }}>
              Favorites
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: '#ff99a0' }}>
              <Heart className="w-12 h-12 text-white" />
            </div>
            <p className="mb-2 text-xl font-bold" style={{ color: '#820933' }}>No favorites yet</p>
            <p className="text-sm text-gray-600 mb-6">
              Tap the heart icon on any dupe to save it here
            </p>
            <button className="inline-block px-8 py-4 text-white rounded-full font-medium shadow-lg" style={{ background: 'linear-gradient(135deg, #ff99a0 0%, #820933 100%)' }}>
              Browse Dupes
            </button>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="sticky bottom-0 z-40 bg-white pb-6 pt-2" style={{ borderTop: '1px solid #ff99a0' }}>
          <div className="flex items-center justify-around px-8">
            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div className="p-2 rounded-xl" style={{ backgroundColor: 'transparent' }}>
                <Home className="w-6 h-6" style={{ color: '#999' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#999' }}>Home</span>
            </div>

            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div className="p-2 rounded-xl" style={{ backgroundColor: '#ff99a0' }}>
                <Heart className="w-6 h-6" style={{ color: '#820933' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#820933' }}>Favorites</span>
            </div>

            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div className="p-2 rounded-xl" style={{ backgroundColor: 'transparent' }}>
                <User className="w-6 h-6" style={{ color: '#999' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#999' }}>Profile</span>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
