import { useState } from "react";
import { ArrowLeft, Search as SearchIcon } from "lucide-react";
import { Link } from "react-router";
import { products, dupes } from "../data/products";
import { Layout } from "./Layout";

export function Search() {
  const [query, setQuery] = useState("");

  const filteredProducts = query.trim() === "" 
    ? [] 
    : products.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.brand.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
      );

  const relatedDupes = filteredProducts.length > 0
    ? dupes.filter(d => 
        filteredProducts.some(p => p.id === d.original.id || p.id === d.dupe.id)
      )
    : [];

  return (
    <Layout>
      <div className="h-full flex flex-col bg-white">
        {/* Search Header */}
        <div className="px-4 pt-4 pb-4 bg-gradient-to-b from-pink-50 to-white">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/" className="p-2 -ml-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h2 className="font-semibold">Search</h2>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-3">
            <SearchIcon className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products or brands..."
              className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {query.trim() === "" ? (
            <div className="text-center py-12">
              <SearchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Search for makeup products</p>
              <p className="text-sm text-gray-400 mt-2">Try "lipstick", "foundation", or "Chanel"</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No results found</p>
              <p className="text-sm text-gray-400 mt-2">Try a different search term</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Found {relatedDupes.length} dupe{relatedDupes.length !== 1 ? 's' : ''}
              </p>

              <div className="space-y-3">
                {relatedDupes.map(dupe => (
                  <Link key={dupe.id} to={`/product/${dupe.id}`}>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
                      <div className="flex gap-3">
                        {/* Original */}
                        <div className="flex-1">
                          <div className="aspect-square bg-gradient-to-br from-pink-100 to-purple-100 rounded-xl mb-2 overflow-hidden">
                            <img src={dupe.original.image} alt={dupe.original.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-xs text-gray-500">{dupe.original.brand}</p>
                          <p className="font-medium text-sm line-clamp-1">{dupe.original.name}</p>
                          <p className="text-pink-600 font-bold">${dupe.original.price}</p>
                        </div>

                        <div className="flex items-center px-1">
                          <div className="text-2xl">→</div>
                        </div>

                        {/* Dupe */}
                        <div className="flex-1">
                          <div className="aspect-square bg-gradient-to-br from-green-100 to-blue-100 rounded-xl mb-2 overflow-hidden">
                            <img src={dupe.dupe.image} alt={dupe.dupe.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="text-xs text-gray-500">{dupe.dupe.brand}</p>
                          <p className="font-medium text-sm line-clamp-1">{dupe.dupe.name}</p>
                          <p className="text-green-600 font-bold">${dupe.dupe.price}</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <div className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                          {dupe.similarity}% Match
                        </div>
                        <div className="text-sm text-green-600 font-bold">
                          Save ${dupe.savings.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}