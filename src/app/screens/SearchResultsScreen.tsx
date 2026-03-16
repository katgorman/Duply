import { ArrowLeft, Home, Heart, User } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function SearchResultsScreen() {
  const dupes = [
    {
      name: "e.l.f. Cosmetics Camo Liquid Blush",
      match: 98,
      price: "$7.00",
    },
    {
      name: "NYX Sweet Cheeks Soft Cheek Tint",
      match: 95,
      price: "$8.99",
    },
    {
      name: "Milani Cheek Kiss Liquid Blush",
      match: 92,
      price: "$9.99",
    },
    {
      name: "Flower Beauty Blush Bomb",
      match: 89,
      price: "$9.98",
    },
    {
      name: "Makeup Revolution Superdewy Liquid Blush",
      match: 85,
      price: "$7.00",
    },
    {
      name: "Wet n Wild MegaGlo Liquid Blush",
      match: 78,
      price: "$4.99",
    },
    {
      name: "Physicians Formula Happy Booster Blush",
      match: 72,
      price: "$10.95",
    },
    {
      name: "Covergirl Clean Fresh Cream Blush",
      match: 68,
      price: "$8.47",
    },
    {
      name: "L.A. Girl Blush Bomb Liquid Blush",
      match: 62,
      price: "$6.99",
    },
  ];

  return (
    <PhoneFrame>
      <div
        className="h-full flex flex-col"
        style={{
          background:
            "linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)",
        }}
      >
        {/* Top Bar */}
        <div
          className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg"
          style={{ borderBottom: "1px solid #ff99a0" }}
        >
          <div className="px-4 pt-12 pb-3 flex items-center justify-between">
            <button className="p-2 -ml-2 hover:bg-pink-50 rounded-full transition-colors">
              <ArrowLeft
                className="w-6 h-6"
                style={{ color: "#820933" }}
              />
            </button>

            <div className="text-center flex-1">
              <h1
                className="text-lg font-bold"
                style={{ color: "#820933" }}
              >
                Rare Beauty Soft Pinch
              </h1>
              <p
                className="text-xs"
                style={{ color: "#ff99a0" }}
              >
                9 dupes found
              </p>
            </div>

            <div className="w-10" />
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {dupes.map((dupe, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-3 shadow-sm flex items-stretch gap-3"
              >
                {/* Product Image */}
                <div
                  className="w-20 h-20 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: "#f5f5f5" }}
                >
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                    Image
                  </div>
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <h3
                    className="font-semibold text-sm leading-tight"
                    style={{ color: "#820933" }}
                  >
                    {dupe.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="leading-none"
                      style={{
                        color: "#ff99a0",
                        fontSize: "20px",
                      }}
                    >
                      {dupe.match}%
                    </span>
                    <span
                      className="leading-none"
                      style={{
                        color: "#ff99a0",
                        fontSize: "20px",
                      }}
                    >
                      match
                    </span>
                  </div>
                </div>

                {/* Price and Badges */}
                <div className="flex flex-col items-end justify-between">
                  <span
                    className="font-bold text-lg"
                    style={{ color: "#820933" }}
                  >
                    {dupe.price}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Navigation */}
        <div
          className="sticky bottom-0 z-40 bg-white pb-6 pt-2"
          style={{ borderTop: "1px solid #ff99a0" }}
        >
          <div className="flex items-center justify-around px-8">
            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div
                className="p-2 rounded-xl"
                style={{ backgroundColor: "transparent" }}
              >
                <Home
                  className="w-6 h-6"
                  style={{ color: "#999" }}
                />
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: "#999" }}
              >
                Home
              </span>
            </div>

            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div
                className="p-2 rounded-xl"
                style={{ backgroundColor: "transparent" }}
              >
                <Heart
                  className="w-6 h-6"
                  style={{ color: "#999" }}
                />
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: "#999" }}
              >
                Favorites
              </span>
            </div>

            <div className="flex flex-col items-center gap-1 p-2 transition-all">
              <div
                className="p-2 rounded-xl"
                style={{ backgroundColor: "transparent" }}
              >
                <User
                  className="w-6 h-6"
                  style={{ color: "#999" }}
                />
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: "#999" }}
              >
                Profile
              </span>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}