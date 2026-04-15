import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';

interface ProductCardProps {
  name: string;
  brand: string;
  price: number;
  image: string;
  matchPercent?: number;
  originalPrice?: number;
  onPress?: () => void;
}

export default function ProductCard({
  name,
  brand,
  price,
  image,
  matchPercent,
  originalPrice,
  onPress,
}: ProductCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.image}
          contentFit="cover"
          placeholder={{ blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH' }}
          transition={300}
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderText}>No image</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.brand}>{brand}</Text>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <View style={styles.bottom}>
          {matchPercent != null && (
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>{matchPercent}%</Text>
            </View>
          )}
          <View style={styles.priceRow}>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
            {originalPrice != null && (
              <Text style={styles.origPrice}>${originalPrice.toFixed(2)}</Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 170,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'visible',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.md,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.98 }, { translateY: -2 }],
  },
  image: {
    width: '100%',
    height: 128,
    backgroundColor: colors.skeleton,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...typography.small,
    color: colors.textMuted,
  },
  info: {
    padding: spacing.md,
  },
  brand: {
    ...typography.small,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  name: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 4,
    minHeight: 40,
  },
  bottom: {
    marginTop: spacing.md,
  },
  matchBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  matchText: {
    ...typography.smallBold,
    color: colors.accentDark,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  price: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  origPrice: {
    ...typography.small,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
});
