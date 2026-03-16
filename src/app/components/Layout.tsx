import { useState } from "react";
import { Home, Heart, User, Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { PhoneFrame } from "./PhoneFrame";
import { categories } from "../data/products";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <PhoneFrame>
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Top Bar with Hamburger */}
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg" style={{ borderBottom: '1px solid #ff99a0' }}>
          <div className="px-4 pt-12 pb-3 flex items-center justify-between">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-pink-50 rounded-xl transition-colors"
            >
              <Menu className="w-6 h-6" style={{ color: '#820933' }} />
            </button>
            
            <div className="text-center">
              <h1 className="text-xl font-bold" style={{ color: '#820933' }}>
                DupeMatch
              </h1>
            </div>

            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </div>

        {/* Hamburger Menu Overlay */}
        {menuOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl transform transition-transform">
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-lg font-bold" style={{ color: '#820933' }}>Categories</h2>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="space-y-2">
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={cat.id === "all" ? "/" : `/?category=${cat.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-pink-50 transition-all group"
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="text-gray-700 font-medium" style={{ color: '#820933' }}>
                        {cat.name}
                      </span>
                    </Link>
                  ))}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #ff99a0 0%, #820933 100%)' }}>
                    <p className="text-sm opacity-90 mb-1">Find the best dupes</p>
                    <p className="font-bold">Save up to 90%</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Bottom Navigation */}
        <div className="sticky bottom-0 z-40 bg-white pb-6 pt-2" style={{ borderTop: '1px solid #ff99a0' }}>
          <div className="flex items-center justify-around px-8">
            <Link
              to="/"
              className={`flex flex-col items-center gap-1 p-2 transition-all`}
            >
              <div className={`p-2 rounded-xl ${isActive("/") ? "" : ""}`} style={{ backgroundColor: isActive("/") ? '#ff99a0' : 'transparent' }}>
                <Home className={`w-6 h-6`} style={{ color: isActive("/") ? '#820933' : '#999' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: isActive("/") ? '#820933' : '#999' }}>Home</span>
            </Link>

            <Link
              to="/favorites"
              className={`flex flex-col items-center gap-1 p-2 transition-all`}
            >
              <div className={`p-2 rounded-xl`} style={{ backgroundColor: isActive("/favorites") ? '#ff99a0' : 'transparent' }}>
                <Heart className={`w-6 h-6`} style={{ color: isActive("/favorites") ? '#820933' : '#999' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: isActive("/favorites") ? '#820933' : '#999' }}>Favorites</span>
            </Link>

            <Link
              to="/profile"
              className={`flex flex-col items-center gap-1 p-2 transition-all`}
            >
              <div className={`p-2 rounded-xl`} style={{ backgroundColor: isActive("/profile") ? '#ff99a0' : 'transparent' }}>
                <User className={`w-6 h-6`} style={{ color: isActive("/profile") ? '#820933' : '#999' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: isActive("/profile") ? '#820933' : '#999' }}>Profile</span>
            </Link>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}