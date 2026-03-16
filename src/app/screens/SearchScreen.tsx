import { ArrowLeft, Search, Clock, X, Home, Heart, User } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function SearchScreen() {
  const searchHistory = [
    "Rare Beauty Soft Pinch Blush",
    "Charlotte Tilbury Pillow Talk",
    "NARS Orgasm Blush",
    "Fenty Beauty Gloss Bomb",
    "Too Faced Better Than Sex Mascara",
    "Urban Decay Naked Palette"
  ];

  return (
    <PhoneFrame>
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Top Bar */}
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg" style={{ borderBottom: '1px solid #ff99a0' }}>
          <div className="px-4 pt-12 pb-3">
            <div className="flex items-center gap-3 mb-3">
              <button className="p-2 -ml-2 hover:bg-pink-50 rounded-full transition-colors">
                <ArrowLeft className="w-6 h-6" style={{ color: '#820933' }} />
              </button>
              <h1 className="text-lg font-bold" style={{ color: '#820933' }}>
                Search Products
              </h1>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#ff99a0' }} />
              <input
                type="text"
                placeholder="Search for high-end products..."
                className="w-full pl-11 pr-4 py-3 rounded-full border-2 outline-none transition-colors"
                style={{ 
                  borderColor: '#ff99a0',
                  color: '#820933'
                }}
              />
            </div>
          </div>
        </div>

        {/* Search History */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2 className="text-sm font-semibold mb-3" style={{ color: '#820933' }}>
            Recent Searches
          </h2>
          
          <div className="space-y-2">
            {searchHistory.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Clock className="w-5 h-5 flex-shrink-0" style={{ color: '#ff99a0' }} />
                  <span className="text-sm truncate" style={{ color: '#820933' }}>
                    {item}
                  </span>
                </div>
                <button className="p-1 hover:bg-pink-50 rounded-full transition-colors">
                  <X className="w-4 h-4" style={{ color: '#999' }} />
                </button>
              </div>
            ))}
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
              <div className="p-2 rounded-xl" style={{ backgroundColor: 'transparent' }}>
                <Heart className="w-6 h-6" style={{ color: '#999' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#999' }}>Favorites</span>
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
