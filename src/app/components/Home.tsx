import { Search } from "lucide-react";
import { Link } from "react-router";
import { Layout } from "./Layout";

export function Home() {
  return (
    <Layout>
      <div className="h-full flex flex-col items-center pt-32 px-8" style={{ background: 'linear-gradient(to bottom, #ffebee 0%, #fce4ec 50%, #f8bbd0 100%)' }}>
        {/* Heading */}
        <h2 className="text-3xl font-bold mb-3 text-center" style={{ color: '#820933' }}>
          Find Your Perfect Dupe
        </h2>
        <p className="text-gray-600 mb-10 text-center text-lg">
          Discover affordable alternatives
        </p>

        {/* Large Search Bar */}
        <Link to="/search" className="w-full">
          <div className="relative w-full">
            <div className="flex items-center gap-4 bg-white rounded-3xl px-8 py-7 shadow-2xl border-4 hover:scale-105 transition-transform" style={{ borderColor: '#ff99a0' }}>
              <Search className="w-8 h-8" style={{ color: '#820933' }} />
              <span className="text-gray-400 text-xl">Search products...</span>
            </div>
          </div>
        </Link>
      </div>
    </Layout>
  );
}