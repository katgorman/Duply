import React from "react";
import { View, Text } from "react-native";
import SimilarityMeter from "./SimilarityMeter";

export default function DupeCard({ dupe }: any) {
  return (
    <View style={{ padding: 12 }}>
      <Text>{dupe.brand}</Text>
      <Text>{dupe.name}</Text>
      <SimilarityMeter score={dupe.similarity} />
    </View>
  );
}