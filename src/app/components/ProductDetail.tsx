import { useParams, Link } from "react-router";
import { ArrowLeft, Heart, Star, Check, Info } from "lucide-react";
import { dupes } from "../data/products";
import { Layout } from "./Layout";
import { useState } from "react";

export function ProductDetail() {
  const { id } = useParams();
  const dupe = dupes.find(d => d.id === id);
  const [isFavorite, setIsFavorite] = useState(false);

  if (!dupe) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <p>Product not found</p>
        </div>
      </Layout>
    );
  }

  const { original, dupe: dupeProduct, similarity, savings } = dupe;

  return (
    <Layout>
      <div className="h-full overflow-y-auto bg-white">
        {/* Back and Favorite Header */}
        <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="p-2 -ml-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h2 className="font-semibold">Dupe Comparison</h2>
            <button 
              onClick={() => setIsFavorite(!isFavorite)}
              className="p-2 -mr-2 hover:bg-gray-100 rounded-full"
            >
              <Heart className={`w-6 h-6 ${isFavorite ? 'fill-pink-500 text-pink-500' : 'text-gray-400'}`} />
            </button>
          </div>
        </div>

        {/* Match Score */}
        <div className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-6">
          <div className="text-center">
            <div className="text-5xl font-bold mb-2">{similarity}%</div>
            <p className="text-pink-100">Match Score</p>
          </div>
        </div>

        {/* Savings Banner */}
        <div className="bg-green-50 border-y border-green-200 px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-green-900 font-bold">Save ${savings.toFixed(2)}</p>
              <p className="text-green-700 text-xs">
                That's {Math.round((savings / original.price) * 100)}% off!
              </p>
            </div>
          </div>
        </div>

        {/* Product Comparison */}
        <div className="px-4 py-6">
          <h3 className="font-bold text-gray-800 mb-4">Product Comparison</h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Original Product */}
            <div>
              <div className="bg-gradient-to-br from-pink-100 to-purple-100 rounded-2xl aspect-square mb-3 overflow-hidden">
                <img src={original.image} alt={original.name} className="w-full h-full object-cover" />
              </div>
              <div className="bg-pink-50 rounded-xl p-3 border border-pink-200">
                <p className="text-xs text-pink-600 font-semibold mb-1">ORIGINAL</p>
                <p className="text-xs text-gray-500 mb-1">{original.brand}</p>
                <p className="font-medium text-sm mb-2 line-clamp-2">{original.name}</p>
                {original.shade && (
                  <p className="text-xs text-gray-600 mb-2">Shade: {original.shade}</p>
                )}
                <div className="flex items-center gap-1 mb-2">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-medium">{original.rating}</span>
                </div>
                <p className="text-pink-600 font-bold text-lg">${original.price}</p>
              </div>
            </div>

            {/* Dupe Product */}
            <div>
              <div className="bg-gradient-to-br from-green-100 to-blue-100 rounded-2xl aspect-square mb-3 overflow-hidden">
                <img src={dupeProduct.image} alt={dupeProduct.name} className="w-full h-full object-cover" />
              </div>
              <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                <p className="text-xs text-green-600 font-semibold mb-1">DUPE</p>
                <p className="text-xs text-gray-500 mb-1">{dupeProduct.brand}</p>
                <p className="font-medium text-sm mb-2 line-clamp-2">{dupeProduct.name}</p>
                {dupeProduct.shade && (
                  <p className="text-xs text-gray-600 mb-2">Shade: {dupeProduct.shade}</p>
                )}
                <div className="flex items-center gap-1 mb-2">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-medium">{dupeProduct.rating}</span>
                </div>
                <p className="text-green-600 font-bold text-lg">${dupeProduct.price}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Why This Match */}
        <div className="px-4 pb-6">
          <h3 className="font-bold text-gray-800 mb-3">Why This Match?</h3>
          
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
            <div className="flex items-start gap-3 mb-3">
              <Info className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Based on our analysis, these products share similar:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Formula and finish</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Color and pigmentation</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Wear time and longevity</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Application and texture</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Summary */}
        <div className="px-4 pb-6">
          <h3 className="font-bold text-gray-800 mb-3">Community Reviews</h3>
          
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  JM
                </div>
                <div>
                  <p className="font-medium text-sm">Jessica M.</p>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                "Amazing dupe! The color match is spot on and it lasts just as long. Saved so much money!"
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  SL
                </div>
                <div>
                  <p className="font-medium text-sm">Sarah L.</p>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                "Can't tell the difference! This app is a game changer for my makeup budget."
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}