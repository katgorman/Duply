const Product = require("../models/Product");
const dupeService = require("../services/dupeService");

exports.getProducts = async (req, res) => {
  const products = await Product.getAll();
  res.json(products);
};

exports.getProduct = async (req, res) => {
  const product = await Product.getById(req.params.id);
  res.json(product);
};

exports.getDupes = async (req, res) => {
  const dupes = await dupeService.findDupes(req.params.id);
  res.json(dupes);
};