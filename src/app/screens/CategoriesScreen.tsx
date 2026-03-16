import { ArrowLeft, Home, Heart, User } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function CategoriesScreen() {
  const categories = [
    { name: "Eyes", color: "#ff99a0" },
    { name: "Lips", color: "#820933" },
    { name: "Face", color: "#ff99a0" },
    { name: "Skin", color: "#820933" }
  ];

  return (
    <PhoneFrame>
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Top Bar */}
        <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg" style={{ borderBottom: '1px solid #ff99a0' }}>
          <div className="px-4 pt-12 pb-3 flex items-center justify-between">
            <button className="p-2 -ml-2 hover:bg-pink-50 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" style={{ color: '#820933' }} />
            </button>
            
            <div className="text-center">
              <h1 className="text-xl font-bold" style={{ color: '#820933' }}>
                Categories
              </h1>
            </div>

            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col h-full gap-4">
            {categories.map((category, index) => (
              <button
                key={index}
                className="flex-1 rounded-2xl text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
                style={{ backgroundColor: category.color }}
              >
                <h2 className="text-3xl font-bold">{category.name}</h2>
              </button>
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