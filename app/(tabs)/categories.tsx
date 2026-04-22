import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from '../../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useCategories } from '../../hooks/useProducts';
import { prefetchCategoryPage } from '../../services/api';
import type { Category } from '../../services/api';

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

export default function CategoriesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compactCategoryLayout = width < 760;
  const { data, loading: categoriesLoading } = useCategories();

  const categories = data?.length ? data : FALLBACK_CATEGORIES;

  useEffect(() => {
    categories.forEach(category => {
      void prefetchCategoryPage(category.productType, { page: 1, pageSize: 10, sort: 'popular' });
    });
  }, [categories]);

  const openCategory = (category: string, title: string) => {
    void prefetchCategoryPage(category, { page: 1, pageSize: 10, sort: 'popular' });
    router.push({
      pathname: '/categoryProducts',
      params: { category, title },
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
});
