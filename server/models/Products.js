const products = [
  { id: "1", brand: "Charlotte Tilbury", name: "Pillow Talk", price: 34 },
  { id: "2", brand: "ELF", name: "Dirty Talk", price: 6 },
  { id: "3", brand: "Maybelline", name: "Touch of Spice", price: 8 }
];

exports.getAll = async () => products;

exports.getById = async (id) => products.find(p => p.id === id);