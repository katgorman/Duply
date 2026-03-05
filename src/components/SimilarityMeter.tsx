import React from "react";
import { View, Text } from "react-native";

export default function SimilarityMeter({ score }: { score: number }) {
  return (
    <View>
      <Text>Similarity: {(score * 100).toFixed(1)}%</Text>
    </View>
  );
}