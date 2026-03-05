const Product = require("../models/Product");

exports.findDupes = async (productId) => {
  const target = await Product.getById(productId);
  const all = await Product.getAll();

  return all
    .filter(p => p.id !== productId)
    .map(p => ({
      ...p,
      similarity: Math.random() * 0.5 + 0.5
    }));
};