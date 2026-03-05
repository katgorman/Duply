const API_URL = "http://localhost:5000/api";

export const getProducts = async () => {
  const res = await fetch(`${API_URL}/products`);
  return res.json();
};

export const getProduct = async (id: string) => {
  const res = await fetch(`${API_URL}/products/${id}`);
  return res.json();
};

export const getDupes = async (id: string) => {
  const res = await fetch(`${API_URL}/products/${id}/dupes`);
  return res.json();
};