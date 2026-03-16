export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  rating: number;
  category: string;
  shade?: string;
}

export interface Dupe {
  id: string;
  original: Product;
  dupe: Product;
  similarity: number;
  savings: number;
  featured: boolean;
}

export const products: Product[] = [
  {
    id: "1",
    name: "Rouge Allure Velvet",
    brand: "Chanel",
    price: 45,
    image: "https://images.unsplash.com/photo-1770981773328-63c2ad10013d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBsaXBzdGljayUyMG1ha2V1cHxlbnwxfHx8fDE3NzE5NzgzNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.8,
    category: "Lipstick",
    shade: "Velvet Red"
  },
  {
    id: "2",
    name: "SuperStay Matte Ink",
    brand: "Maybelline",
    price: 9.99,
    image: "https://images.unsplash.com/photo-1770981773328-63c2ad10013d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBsaXBzdGljayUyMG1ha2V1cHxlbnwxfHx8fDE3NzE5NzgzNzB8MA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.5,
    category: "Lipstick",
    shade: "Pioneer"
  },
  {
    id: "3",
    name: "Double Wear Foundation",
    brand: "Estée Lauder",
    price: 52,
    image: "https://images.unsplash.com/photo-1453761816053-ed5ba727b5b7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb3VuZGF0aW9uJTIwbWFrZXVwJTIwYm90dGxlfGVufDF8fHx8MTc3MjAzMTY1OHww&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.7,
    category: "Foundation",
    shade: "2W1 Dawn"
  },
  {
    id: "4",
    name: "Infallible Pro-Matte",
    brand: "L'Oréal",
    price: 12.99,
    image: "https://images.unsplash.com/photo-1453761816053-ed5ba727b5b7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb3VuZGF0aW9uJTIwbWFrZXVwJTIwYm90dGxlfGVufDF8fHx8MTc3MjAzMTY1OHww&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.4,
    category: "Foundation",
    shade: "103 Natural Buff"
  },
  {
    id: "5",
    name: "Naked Palette",
    brand: "Urban Decay",
    price: 54,
    image: "https://images.unsplash.com/photo-1583012279653-1575246476c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxleWVzaGFkb3clMjBwYWxldHRlJTIwY29zbWV0aWNzfGVufDF8fHx8MTc3MjAzMzA3NXww&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.9,
    category: "Eyeshadow",
  },
  {
    id: "6",
    name: "Nude Palette",
    brand: "NYX",
    price: 18,
    image: "https://images.unsplash.com/photo-1583012279653-1575246476c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxleWVzaGFkb3clMjBwYWxldHRlJTIwY29zbWV0aWNzfGVufDF8fHx8MTc3MjAzMzA3NXww&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.6,
    category: "Eyeshadow",
  },
  {
    id: "7",
    name: "Orgasm Blush",
    brand: "NARS",
    price: 32,
    image: "https://images.unsplash.com/photo-1759695408177-f552293d5afd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxibHVzaCUyMG1ha2V1cCUyMGNvbXBhY3R8ZW58MXx8fHwxNzcyMDI3MjM0fDA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.8,
    category: "Blush",
  },
  {
    id: "8",
    name: "Milani Baked Blush",
    brand: "Milani",
    price: 8.99,
    image: "https://images.unsplash.com/photo-1759695408177-f552293d5afd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxibHVzaCUyMG1ha2V1cCUyMGNvbXBhY3R8ZW58MXx8fHwxNzcyMDI3MjM0fDA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.7,
    category: "Blush",
  },
  {
    id: "9",
    name: "Better Than Sex",
    brand: "Too Faced",
    price: 27,
    image: "https://images.unsplash.com/photo-1758738880203-8968fb4eda82?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXNjYXJhJTIwdHViZSUyMGJlYXV0eXxlbnwxfHx8fDE3NzIwNTM1Mjh8MA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.6,
    category: "Mascara",
  },
  {
    id: "10",
    name: "Lash Sensational",
    brand: "Maybelline",
    price: 8.99,
    image: "https://images.unsplash.com/photo-1758738880203-8968fb4eda82?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXNjYXJhJTIwdHViZSUyMGJlYXV0eXxlbnwxfHx8fDE3NzIwNTM1Mjh8MA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.5,
    category: "Mascara",
  },
  {
    id: "11",
    name: "Champagne Pop",
    brand: "Becca",
    price: 38,
    image: "https://images.unsplash.com/photo-1501728636520-11c972bd5e2e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoaWdobGlnaHRlciUyMG1ha2V1cCUyMHByb2R1Y3R8ZW58MXx8fHwxNzcyMDUzNTI4fDA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.9,
    category: "Highlighter",
  },
  {
    id: "12",
    name: "MegaGlo Highlighter",
    brand: "Wet n Wild",
    price: 4.99,
    image: "https://images.unsplash.com/photo-1501728636520-11c972bd5e2e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoaWdobGlnaHRlciUyMG1ha2V1cCUyMHByb2R1Y3R8ZW58MXx8fHwxNzcyMDUzNTI4fDA&ixlib=rb-4.1.0&q=80&w=1080",
    rating: 4.6,
    category: "Highlighter",
  },
];

export const dupes: Dupe[] = [
  {
    id: "d1",
    original: products[0], // Chanel Lipstick
    dupe: products[1], // Maybelline
    similarity: 95,
    savings: 35.01,
    featured: true,
  },
  {
    id: "d2",
    original: products[2], // Estée Lauder Foundation
    dupe: products[3], // L'Oréal
    similarity: 92,
    savings: 39.01,
    featured: true,
  },
  {
    id: "d3",
    original: products[4], // Urban Decay Palette
    dupe: products[5], // NYX
    similarity: 90,
    savings: 36,
    featured: true,
  },
  {
    id: "d4",
    original: products[6], // NARS Blush
    dupe: products[7], // Milani
    similarity: 94,
    savings: 23.01,
    featured: false,
  },
  {
    id: "d5",
    original: products[8], // Too Faced Mascara
    dupe: products[9], // Maybelline
    similarity: 88,
    savings: 18.01,
    featured: false,
  },
  {
    id: "d6",
    original: products[10], // Becca Highlighter
    dupe: products[11], // Wet n Wild
    similarity: 96,
    savings: 33.01,
    featured: true,
  },
];

export const categories = [
  { id: "all", name: "All", icon: "✨" },
  { id: "lipstick", name: "Lipstick", icon: "💄" },
  { id: "foundation", name: "Foundation", icon: "🧴" },
  { id: "eyeshadow", name: "Eyeshadow", icon: "🎨" },
  { id: "blush", name: "Blush", icon: "🌸" },
  { id: "mascara", name: "Mascara", icon: "👁️" },
  { id: "highlighter", name: "Highlighter", icon: "✨" },
];
