import { Settings, Heart, Home, User } from "lucide-react";
import { PhoneFrame } from "../components/PhoneFrame";

export function ProfileScreen() {
  const userName = "Beauty Lover";
  const userEmail = "beauty@example.com";

  return (
    <PhoneFrame>
      <div className="h-full flex flex-col">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
          {/* Profile Header */}
          <div className="px-4 pt-12 pb-8 text-white" style={{ background: 'linear-gradient(135deg, #ff99a0 0%, #820933 100%)' }}>
            <div className="text-center">
              <div className="w-20 h-20 bg-white rounded-full mx-auto mb-3 flex items-center justify-center shadow-lg">
                <User className="w-10 h-10" style={{ color: '#820933' }} />
              </div>
              <h2 className="text-xl font-bold">{userName}</h2>
              <p className="text-pink-100 text-sm">{userEmail}</p>
            </div>
          </div>

          {/* Settings Section */}
          <div className="px-4 py-6">
            <h3 className="font-bold text-gray-800 mb-3">Settings</h3>
            <div className="bg-white rounded-xl border-2 overflow-hidden shadow-lg" style={{ borderColor: '#ff99a0' }}>
              <button className="w-full flex items-center justify-between p-4 hover:bg-pink-50 transition-colors border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5" style={{ color: '#820933' }} />
                  <span className="text-sm font-medium">Account Settings</span>
                </div>
                <span className="text-gray-400">→</span>
              </button>
              <button className="w-full flex items-center justify-between p-4 hover:bg-pink-50 transition-colors border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Heart className="w-5 h-5" style={{ color: '#820933' }} />
                  <span className="text-sm font-medium">Notifications</span>
                </div>
                <span className="text-gray-400">→</span>
              </button>
              <button className="w-full flex items-center justify-between p-4 hover:bg-pink-50 transition-colors">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5" style={{ color: '#820933' }} />
                  <span className="text-sm font-medium">Privacy & Security</span>
                </div>
                <span className="text-gray-400">→</span>
              </button>
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
              <div className="p-2 rounded-xl" style={{ backgroundColor: '#ff99a0' }}>
                <User className="w-6 h-6" style={{ color: '#820933' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: '#820933' }}>Profile</span>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}