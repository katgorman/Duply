import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

type Props = {
  product: any;
  onPress: () => void;
};

export default function ProductCard({ product, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress}>
      <View style={{ padding: 12, borderBottomWidth: 1 }}>
        <Text>{product.brand}</Text>
        <Text>{product.name}</Text>
        <Text>${product.price}</Text>
      </View>
    </TouchableOpacity>
  );
}