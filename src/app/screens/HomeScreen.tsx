import { Search, Home, Heart, User, Menu } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function HomeScreen() {
  return (
    <PhoneFrame>
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Top Bar with Hamburger */}
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg" style={{ borderBottom: '1px solid #ff99a0' }}>
          <div className="px-4 pt-12 pb-3 flex items-center justify-between">
            <button className="p-2 hover:bg-pink-50 rounded-xl transition-colors">
              <Menu className="w-6 h-6" style={{ color: '#820933' }} />
            </button>
            
            <div className="text-center">
              <h1 className="text-3xl font-bold" style={{ color: '#820933' }}>
                duply
              </h1>
            </div>

            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col items-center pt-32 px-8" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
            {/* Heading */}
            <h2 className="text-3xl font-bold mb-3 text-center" style={{ color: '#820933' }}>
              Find Your Perfect Dupe
            </h2>
            <p className="text-gray-600 mb-10 text-center text-lg">
              Discover affordable alternatives
            </p>

            {/* Large Search Bar */}
            <div className="w-full">
              <div className="relative w-full">
                <div className="flex items-center gap-4 bg-white rounded-3xl px-8 py-7 shadow-2xl border-4 hover:scale-105 transition-transform" style={{ borderColor: '#ff99a0' }}>
                  <Search className="w-8 h-8" style={{ color: '#820933' }} />
                  <span className="text-gray-400 text-xl">Search products...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="sticky bottom-0 z-40 bg-white pb-6 pt-2" style={{ borderTop: '1px solid #ff99a0' }}>
          <div className="flex items-center justify-around px-8">
            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div className="p-2 rounded-xl" style={{ backgroundColor: '#ff99a0' }}>
                <Home className="w-6 h-6" style={{ color: '#820933' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#820933' }}>Home</span>
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
