import { Settings, DollarSign, Heart, TrendingUp, Award } from "lucide-react";
import { Layout } from "./Layout";
import { dupes } from "../data/products";

export function Profile() {
  // Mock user data
  const userName = "Beauty Lover";
  const userEmail = "beauty@example.com";
  const savedDupes = 12;
  const totalSavings = dupes.reduce((sum, d) => sum + d.savings, 0);

  return (
    <Layout>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-pink-50 to-white">
        {/* Profile Header */}
        <div className="px-4 py-6 bg-gradient-to-br from-pink-500 to-purple-500 text-white">
          <div className="text-center">
            <div className="w-20 h-20 bg-white rounded-full mx-auto mb-3 flex items-center justify-center">
              <span className="text-3xl">👩</span>
            </div>
            <h2 className="text-xl font-bold">{userName}</h2>
            <p className="text-pink-100 text-sm">{userEmail}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="px-4 -mt-6">
          <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Heart className="w-6 h-6 text-pink-500" />
                </div>
                <div className="text-2xl font-bold text-gray-800">{savedDupes}</div>
                <p className="text-xs text-gray-600">Saved Dupes</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <DollarSign className="w-6 h-6 text-green-500" />
                </div>
                <div className="text-2xl font-bold text-gray-800">${totalSavings.toFixed(0)}</div>
                <p className="text-xs text-gray-600">Total Savings</p>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="px-4 py-6">
          <h3 className="font-bold text-gray-800 mb-3">Achievements</h3>
          <div className="space-y-2">
            <div className="bg-white rounded-xl p-4 border border-purple-200 flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Award className="w-6 h-6 text-purple-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Smart Saver</p>
                <p className="text-xs text-gray-500">Saved over $100</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-pink-200 flex items-center gap-3">
              <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-pink-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Dupe Hunter</p>
                <p className="text-xs text-gray-500">Found 10+ dupes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Options */}
        <div className="px-4 pb-6">
          <h3 className="font-bold text-gray-800 mb-3">Settings</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-gray-400" />
                <span className="text-sm">Account Settings</span>
              </div>
              <span className="text-gray-400">→</span>
            </button>
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-gray-400" />
                <span className="text-sm">Preferences</span>
              </div>
              <span className="text-gray-400">→</span>
            </button>
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-gray-400" />
                <span className="text-sm">About</span>
              </div>
              <span className="text-gray-400">→</span>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
