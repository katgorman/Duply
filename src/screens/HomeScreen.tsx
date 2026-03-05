import React, { useEffect, useState } from "react";
import { View, FlatList } from "react-native";
import ProductCard from "../components/ProductCard";
import { getProducts } from "../services/api";

export default function HomeScreen({ navigation }: any) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    getProducts().then(setProducts);
  }, []);

  return (
    <View>
      <FlatList
        data={products}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={() =>
              navigation.navigate("ProductDetail", { id: item.id })
            }
          />
        )}
      />
    </View>
  );
}