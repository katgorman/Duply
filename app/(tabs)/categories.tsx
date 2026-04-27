import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from '../../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useCategories } from '../../hooks/useProducts';
import { prefetchCategoryPage } from '../../services/api';
import type { Category, Dupe, Product } from '../../services/api';
import { getFeaturedGiftsUnder15FromBackend, getFeaturedHighEntropyDupesFromBackend } from '../../services/backendApi';

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'face', name: 'Face', emoji: '', productType: 'face', color: '#F7C6D9' },
  { id: 'lips', name: 'Lips', emoji: '', productType: 'lips', color: '#FFE4F0' },
  { id: 'eyes', name: 'Eyes', emoji: '', productType: 'eyes', color: '#FFF9F0' },
  { id: 'skincare', name: 'Skincare', emoji: '', productType: 'skincare', color: '#FFF6F9' },
  { id: 'nails', name: 'Nails', emoji: '', productType: 'nails', color: '#FFF2DC' },
  { id: 'other', name: 'Other', emoji: '', productType: 'other', color: '#2A0B26' },
];

const CATEGORY_ART: Record<
  string,
  { source: number; scale: number }
> = {
  eyes: { source: require('../../assets/category-art/3.png'), scale: 1.04 },
  lips: { source: require('../../assets/category-art/4.png'), scale: 1.03 },
  skincare: { source: require('../../assets/category-art/5.png'), scale: 1.02 },
  face: { source: require('../../assets/category-art/6.png'), scale: 1.04 },
  nails: { source: require('../../assets/category-art/7.png'), scale: 1.02 },
  other: { source: require('../../assets/category-art/8.png'), scale: 0.96 },
};

function CategoryTile({
  category,
  wide = false,
  compact = false,
  onPress,
}: {
  category: Category;
  wide?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const dark = category.id === 'other';
  const art = CATEGORY_ART[category.id] || CATEGORY_ART.other;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryTile,
        wide && styles.categoryTileWide,
        compact && styles.categoryTileCompact,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.categoryTileInner, compact && styles.categoryTileInnerCompact, { backgroundColor: category.color }]}>
        <View style={[styles.categoryArtFrame, compact && styles.categoryArtFrameCompact, dark && styles.categoryArtFrameDark]}>
          <View style={[styles.categoryArtScaleWrap, compact && styles.categoryArtScaleWrapCompact, { transform: [{ scale: art.scale }] }]}>
            <Image source={art.source} style={styles.categoryArtImage} contentFit="contain" />
          </View>
        </View>
        <View style={[styles.categoryBottomRow, compact && styles.categoryBottomRowCompact]}>
          <Text style={[styles.categoryName, compact && styles.categoryNameCompact, dark && styles.categoryNameDark]}>{category.name}</Text>
          <View style={styles.categoryFooterRow}>
            <Text style={[styles.categoryMeta, compact && styles.categoryMetaCompact, dark && styles.categoryMetaDark]}>
              {typeof category.count === 'number' ? 'Products' : 'Loading totals'}
            </Text>
            {typeof category.count === 'number' ? (
              <Text style={[styles.categoryCount, compact && styles.categoryCountCompact, dark && styles.categoryCountDark]}>
                {category.count.toLocaleString()}
              </Text>
            ) : (
              <Skeleton
                width={62}
                height={14}
                borderRadius={radius.full}
                style={styles.categoryCountSkeleton}
              />
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function HighEntropyDupeCard({ item, onPress }: { item: Dupe; onPress: () => void }) {
  const savingsPct = item.original.price > 0
    ? Math.round(((item.original.price - item.dupe.price) / item.original.price) * 100)
    : 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.entropyCard, pressed && styles.cardPressed]}>
      <View style={styles.entropySavingsBadge}>
        <Text style={styles.entropySavingsText}>Save {savingsPct}%</Text>
      </View>

      <View style={styles.entropyRow}>
        <View style={styles.entropyProductSide}>
          {item.original.image ? (
            <Image source={{ uri: item.original.image }} style={styles.entropyImage} contentFit="cover" />
          ) : (
            <View style={[styles.entropyImage, styles.entropyImagePlaceholder]} />
          )}
          <Text style={styles.entropyBrand} numberOfLines={1}>{item.original.brand}</Text>
          <Text style={styles.entropyName} numberOfLines={2}>{item.original.name}</Text>
          <Text style={styles.entropyPrice}>${item.original.price.toFixed(2)}</Text>
        </View>

        <View style={styles.entropyArrowCol}>
          <Text style={styles.entropyArrow}>→</Text>
          <Text style={styles.entropyMatchChip}>{item.similarity}%</Text>
        </View>

        <View style={styles.entropyProductSide}>
          {item.dupe.image ? (
            <Image source={{ uri: item.dupe.image }} style={styles.entropyImage} contentFit="cover" />
          ) : (
            <View style={[styles.entropyImage, styles.entropyImagePlaceholder]} />
          )}
          <Text style={styles.entropyBrand} numberOfLines={1}>{item.dupe.brand}</Text>
          <Text style={styles.entropyName} numberOfLines={2}>{item.dupe.name}</Text>
          <Text style={[styles.entropyPrice, styles.entropyDupePrice]}>${item.dupe.price.toFixed(2)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function GiftCard({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.giftCard, pressed && styles.cardPressed]}>
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.giftImage} contentFit="cover" />
      ) : (
        <View style={[styles.giftImage, styles.giftImagePlaceholder]} />
      )}
      <View style={styles.giftInfo}>
        <Text style={styles.giftBrand} numberOfLines={1}>{product.brand}</Text>
        <Text style={styles.giftName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.giftPrice}>${product.price.toFixed(2)}</Text>
        {product.rating > 0 ? (
          <Text style={styles.giftRating}>★ {product.rating.toFixed(1)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compactCategoryLayout = width < 760;
  const { data, loading: categoriesLoading } = useCategories();

  const [entropyDupes, setEntropyDupes] = useState<Dupe[]>([]);
  const [entropyLoading, setEntropyLoading] = useState(true);
  const [gifts, setGifts] = useState<Product[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(true);

  const categories = data?.length ? data : FALLBACK_CATEGORIES;

  useEffect(() => {
    categories.forEach(category => {
      void prefetchCategoryPage(category.productType, { page: 1, pageSize: 10, sort: 'popular' });
    });
  }, [categories]);

  useEffect(() => {
    getFeaturedHighEntropyDupesFromBackend()
      .then(setEntropyDupes)
      .catch(() => {})
      .finally(() => setEntropyLoading(false));
    getFeaturedGiftsUnder15FromBackend()
      .then(setGifts)
      .catch(() => {})
      .finally(() => setGiftsLoading(false));
  }, []);

  const openCategory = (category: string, title: string) => {
    void prefetchCategoryPage(category, { page: 1, pageSize: 10, sort: 'popular' });
    router.push({
      pathname: '/categoryProducts',
      params: { category, title },
    });
  };

  const openProduct = (product: Product) => {
    router.push({
      pathname: '/productDetails',
      params: { id: product.id },
    });
  };

  const openDupeSearch = (product: Product) => {
    router.push({
      pathname: '/searchResults',
      params: {
        productId: product.id,
        productName: product.name,
        productBrand: product.brand,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.eyebrow}>Beauty Catalog</Text>
        <Text style={styles.title}>Categories</Text>
      </View>

      <View style={styles.content}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(350)} style={styles.sectionBlock}>
            {categoriesLoading && !data?.length ? (
              <View style={styles.categoryLoadingRow}>
                <View style={styles.loadingPill}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingPillText}>Loading</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.categoryGrid}>
              {categories.map((category, index) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  wide={compactCategoryLayout || (categories.length % 2 === 1 && index === categories.length - 1)}
                  compact={compactCategoryLayout}
                  onPress={() => openCategory(category.productType, category.name)}
                />
              ))}
            </View>
          </Animated.View>

          {/* High Entropy Dupes */}
          <Animated.View entering={FadeInDown.duration(400).delay(80)}>
            <View style={styles.featuredHeader}>
              <Text style={styles.featuredTitle}>High Value Dupes</Text>
              <Text style={styles.featuredSubtitle}>High-end products with significantly cheaper matches</Text>
            </View>
            <View style={styles.featuredBlock}>
              {entropyLoading ? (
                <View style={styles.featuredLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.featuredLoadingText}>Finding dupes...</Text>
                </View>
              ) : entropyDupes.length === 0 ? (
                <Text style={styles.featuredEmpty}>No high-value dupes found right now.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                  {entropyDupes.map(item => (
                    <HighEntropyDupeCard
                      key={item.id}
                      item={item}
                      onPress={() => openDupeSearch(item.original)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>

          {/* Gifts Under $15 */}
          <Animated.View entering={FadeInDown.duration(400).delay(160)}>
            <View style={styles.featuredHeader}>
              <Text style={styles.featuredTitle}>Gifts Under $15</Text>
              <Text style={styles.featuredSubtitle}>Top-rated picks that make great gifts</Text>
            </View>
            <View style={styles.featuredBlock}>
              {giftsLoading ? (
                <View style={styles.featuredLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.featuredLoadingText}>Loading gifts...</Text>
                </View>
              ) : gifts.length === 0 ? (
                <Text style={styles.featuredEmpty}>No gift picks found right now.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                  {gifts.map(product => (
                    <GiftCard
                      key={product.id}
                      product={product}
                      onPress={() => openProduct(product)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.pink,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  eyebrow: {
    ...typography.label,
    color: colors.primaryLight,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingPillText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  categoryTile: {
    width: '48.2%',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  categoryTileWide: {
    width: '100%',
  },
  categoryTileCompact: {
    width: '100%',
  },
  categoryTileInner: {
    minHeight: 228,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  categoryTileInnerCompact: {
    minHeight: 172,
    paddingVertical: spacing.sm,
  },
  categoryArtFrame: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    bottom: spacing.sm,
    width: '48%',
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  categoryArtFrameCompact: {
    width: '42%',
    top: spacing.xs,
    bottom: spacing.xs,
    right: spacing.sm,
  },
  categoryArtFrameDark: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  categoryArtScaleWrap: {
    width: '92%',
    height: '92%',
    alignSelf: 'flex-end',
    justifyContent: 'center',
  },
  categoryArtScaleWrapCompact: {
    width: '100%',
    height: '86%',
  },
  categoryArtImage: {
    width: '100%',
    height: '100%',
    alignSelf: 'flex-end',
  },
  categoryLoadingRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  categoryCount: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  categoryCountDark: {
    color: colors.cream,
  },
  categoryCountSkeleton: {
    alignSelf: 'flex-start',
  },
  categoryBottomRow: {
    width: '46%',
    minHeight: 92,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: spacing.sm,
    zIndex: 1,
  },
  categoryBottomRowCompact: {
    width: '54%',
    minHeight: 76,
  },
  categoryName: {
    ...typography.h2,
    color: colors.text,
    textTransform: 'uppercase',
    maxWidth: '100%',
    width: '100%',
    lineHeight: 28,
    textAlign: 'left',
  },
  categoryNameCompact: {
    fontSize: 24,
    lineHeight: 24,
  },
  categoryNameDark: {
    color: colors.surface,
  },
  categoryFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  categoryMeta: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  categoryMetaCompact: {
    fontSize: 12,
  },
  categoryMetaDark: {
    color: colors.cream,
  },
  categoryCountCompact: {
    fontSize: 15,
  },

  // Featured section shared
  featuredHeader: {
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  featuredTitle: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  featuredSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  featuredBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    minHeight: 80,
    ...shadows.sm,
  },
  featuredLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  featuredLoadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  featuredEmpty: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
  hScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },

  // High Entropy Dupe card
  entropyCard: {
    width: 280,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  entropySavingsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  entropySavingsText: {
    ...typography.smallBold,
    color: colors.textOnPrimary,
  },
  entropyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  entropyProductSide: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  entropyImage: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.pink,
  },
  entropyImagePlaceholder: {
    backgroundColor: colors.skeleton,
  },
  entropyBrand: {
    ...typography.smallBold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  entropyName: {
    ...typography.small,
    color: colors.text,
    textAlign: 'center',
  },
  entropyPrice: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  entropyDupePrice: {
    color: colors.primaryLight,
  },
  entropyArrowCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  entropyArrow: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: '800',
  },
  entropyMatchChip: {
    ...typography.smallBold,
    color: colors.primaryLight,
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  // Gift card
  giftCard: {
    width: 148,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  giftImage: {
    width: '100%',
    height: 148,
    backgroundColor: colors.pink,
  },
  giftImagePlaceholder: {
    backgroundColor: colors.skeleton,
  },
  giftInfo: {
    padding: spacing.sm,
    gap: 3,
  },
  giftBrand: {
    ...typography.smallBold,
    color: colors.textSecondary,
  },
  giftName: {
    ...typography.small,
    color: colors.text,
  },
  giftPrice: {
    ...typography.captionBold,
    color: colors.primary,
    marginTop: 2,
  },
  giftRating: {
    ...typography.small,
    color: colors.primaryLight,
  },
});
