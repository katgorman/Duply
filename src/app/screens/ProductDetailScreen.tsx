import { ArrowLeft, Heart, Star, Home, User } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function ProductDetailScreen() {
  const dupe = {
    brand: "e.l.f. Cosmetics",
    name: "Camo Liquid Blush",
    price: 7.00,
    rating: 4.6,
    shades: ["#FFB6C1", "#FF69B4", "#FF1493", "#C71585", "#DB7093"],
    match: 98,
    ingredients: "Water, Cyclopentasiloxane, Phenyl Trimethicone, Dimethicone, Glycerin, PEG-10 Dimethicone, Butylene Glycol, Sodium Chloride, Disteardimonium Hectorite, Phenoxyethanol, Fragrance, Ethylhexylglycerin, Tocopheryl Acetate"
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    return [...Array(5)].map((_, i) => (
      <Star 
        key={i} 
        className="w-5 h-5" 
        style={{ 
          fill: i < fullStars ? '#FFD700' : 'none',
          color: i < fullStars ? '#FFD700' : '#D1D5DB'
        }} 
      />
    ));
  };

  return (
    <PhoneFrame>
      <div className="h-full flex flex-col" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Back and Favorite Header */}
          <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg px-4 pt-12 pb-3" style={{ borderBottom: '1px solid #ff99a0' }}>
            <div className="flex items-center justify-between">
              <button className="p-2 -ml-2 hover:bg-pink-50 rounded-full">
                <ArrowLeft className="w-6 h-6" style={{ color: '#820933' }} />
              </button>
              <h2 className="font-semibold" style={{ color: '#820933' }}>Product Details</h2>
              <button className="p-2 -mr-2 hover:bg-pink-50 rounded-full">
                <Heart className="w-6 h-6" style={{ color: '#ff99a0' }} />
              </button>
            </div>
          </div>

          {/* Main Product Section */}
          <div className="px-4 py-6">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              {/* Top Section: Image + Product Info */}
              <div className="flex gap-4 mb-4">
                {/* Large Product Image */}
                <div className="w-[55%] aspect-square rounded-lg flex-shrink-0" style={{ backgroundColor: '#f5f5f5' }}>
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                    Product Image
                  </div>
                </div>

                {/* Product Info */}
                <div className="flex-1 flex flex-col">
                  <h3 className="font-semibold text-base leading-tight mb-2" style={{ color: '#820933' }}>
                    {dupe.name}
                  </h3>
                  <p className="text-2xl font-bold mb-2" style={{ color: '#820933' }}>
                    ${dupe.price.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Shade Squares */}
              <div className="mb-4 flex flex-col items-center">
                <p className="text-xs font-semibold mb-2" style={{ color: '#820933' }}>Available Shades</p>
                <div className="flex gap-2">
                  {dupe.shades.map((shade, i) => (
                    <div 
                      key={i}
                      className="w-8 h-8 rounded border-2 border-gray-200"
                      style={{ backgroundColor: shade }}
                    />
                  ))}
                </div>
              </div>

              {/* Match Percentage */}
              <div className="mb-4 flex justify-center">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold leading-none" style={{ color: '#ff99a0' }}>
                    {dupe.match}%
                  </span>
                  <span className="text-lg leading-none" style={{ color: '#ff99a0' }}>
                    match
                  </span>
                </div>
              </div>

              {/* Star Rating */}
              <div className="mb-4 flex justify-center">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {renderStars(dupe.rating)}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#820933' }}>
                    {dupe.rating}
                  </span>
                </div>
              </div>

              {/* Ingredients */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#820933' }}>Ingredients</p>
                <p className="text-xs leading-relaxed text-gray-600">
                  {dupe.ingredients}
                </p>
              </div>
            </div>
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