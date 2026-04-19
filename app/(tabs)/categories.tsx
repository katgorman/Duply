import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from '../../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useCategories, useFeaturedDupes, useProductsByCategory } from '../../hooks/useProducts';
import { prefetchCategoryPage } from '../../services/api';
import type { Category, Dupe, Product } from '../../services/api';

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'eyes', name: 'Eyes', emoji: '', productType: 'eyes', color: '#FFF9F0' },
  { id: 'lips', name: 'Lips', emoji: '', productType: 'lips', color: '#FFE4F0' },
  { id: 'face', name: 'Face', emoji: '', productType: 'face', color: '#F7C6D9' },
  { id: 'skincare', name: 'Skincare', emoji: '', productType: 'skincare', color: '#FFF6F9' },
  { id: 'other', name: 'Other', emoji: '', productType: 'other', color: '#2A0B26' },
];

const MOOD_LANES = [
  {
    id: 'lips-preview',
    title: 'Luxury Lip Alternatives',
    category: 'lips',
  },
  {
    id: 'face-preview',
    title: 'Face Base Refresh',
    category: 'face',
  },
  {
    id: 'skincare-preview',
    title: 'Skincare Standouts',
    category: 'skincare',
  },
] as const;

function SectionHeader({
  title,
  loading = false,
}: {
  title: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {loading ? (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingPillText}>Loading</Text>
        </View>
      ) : null}
    </View>
  );
}

function CategoryTile({
  category,
  wide = false,
  onPress,
}: {
  category: Category;
  wide?: boolean;
  onPress: () => void;
}) {
  const dark = category.id === 'other';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryTile,
        wide && styles.categoryTileWide,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.categoryTileInner, { backgroundColor: category.color }]}>
        <View style={[styles.categoryOrb, dark && styles.categoryOrbDark]} />
        <View style={styles.categoryTopRow}>
          {typeof category.count === 'number' ? (
            <Text style={[styles.categoryCount, dark && styles.categoryCountDark]}>
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

        <View style={styles.categoryBottomRow}>
          <Text style={[styles.categoryName, dark && styles.categoryNameDark]}>{category.name}</Text>
          <Text style={[styles.categoryMeta, dark && styles.categoryMetaDark]}>
            {typeof category.count === 'number' ? 'Products' : 'Loading totals'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function StandoutDupeCard({
  item,
  onPress,
}: {
  item: Dupe;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dupeRailCard, pressed && styles.cardPressed]}>
      <View style={styles.dupeMetricRow}>
        <View style={styles.dupeMetricPill}>
          <Text style={styles.dupeMetricText}>{item.similarity}% match</Text>
        </View>
        <View style={[styles.dupeMetricPill, styles.dupeMetricPillAccent]}>
          <Text style={styles.dupeMetricText}>Save ${item.savings.toFixed(2)}</Text>
        </View>
      </View>
      <Text style={styles.dupeRailTitle} numberOfLines={2}>
        {item.original.familyName || item.original.name}
      </Text>
      <Text style={styles.dupeRailSubtitle} numberOfLines={2}>
        Try {item.dupe.brand} {item.dupe.familyName || item.dupe.name}
      </Text>
      <Text style={styles.dupeRailFoot}>Open comparison</Text>
    </Pressable>
  );
}

function StandoutDupeSkeletonCard() {
  return (
    <View style={styles.dupeRailCard}>
      <View style={styles.dupeMetricRow}>
        <Skeleton width={82} height={28} borderRadius={radius.full} />
        <Skeleton width={88} height={28} borderRadius={radius.full} />
      </View>
      <Skeleton width="84%" height={18} style={{ marginTop: spacing.lg }} />
      <Skeleton width="74%" height={18} style={{ marginTop: spacing.xs }} />
      <Skeleton width="92%" height={14} style={{ marginTop: spacing.md }} />
      <Skeleton width="56%" height={14} style={{ marginTop: spacing.xs }} />
      <Skeleton width={96} height={14} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

function RailEmptyCard({
  title,
}: {
  title: string;
}) {
  return (
    <View style={styles.emptyRailCard}>
      <Text style={styles.emptyRailTitle}>{title}</Text>
    </View>
  );
}

function MoodLaneCard({
  title,
  items,
  loading,
  onPress,
}: {
  title: string;
  items: Product[];
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.moodRailCard, pressed && styles.cardPressed]}>
      <View style={styles.moodCardTopRow}>
        <Text style={styles.moodRailTitle}>{title}</Text>
        <View style={styles.moodCountBadge}>
          <Text style={styles.moodCountText}>{items.length || '--'}</Text>
        </View>
      </View>

      {items.length > 0 ? (
        <View style={styles.moodTagRow}>
          {items.slice(0, 3).map(item => (
            <View key={item.id} style={styles.moodTag}>
              <Text style={styles.moodTagText} numberOfLines={1}>
                {item.familyName || item.name}
              </Text>
            </View>
          ))}
        </View>
      ) : loading ? (
        <View style={styles.moodTagRow}>
          {[0, 1, 2].map(index => (
            <Skeleton
              key={index}
              width={index === 1 ? 118 : 86}
              height={28}
              borderRadius={radius.full}
            />
          ))}
        </View>
      ) : (
        <View style={styles.moodEmptyBox}>
          <Text style={styles.moodEmptyText}>Preview picks are still warming up.</Text>
        </View>
      )}

      <Text style={styles.moodRailFoot}>Open lane</Text>
    </Pressable>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const { data, loading: categoriesLoading } = useCategories();
  const { data: featuredDupes, loading: featuredDupesLoading } = useFeaturedDupes();
  const { data: lipsPreview, loading: lipsPreviewLoading } = useProductsByCategory('lips', {
    page: 1,
    pageSize: 3,
    sort: 'popular',
  });
  const { data: facePreview, loading: facePreviewLoading } = useProductsByCategory('face', {
    page: 1,
    pageSize: 3,
    sort: 'popular',
  });
  const { data: skincarePreview, loading: skincarePreviewLoading } = useProductsByCategory('skincare', {
    page: 1,
    pageSize: 3,
    sort: 'popular',
  });

  const categories = data?.length ? data : FALLBACK_CATEGORIES;
  const moodLanes = [
    { ...MOOD_LANES[0], items: lipsPreview?.items || [], loading: lipsPreviewLoading },
    { ...MOOD_LANES[1], items: facePreview?.items || [], loading: facePreviewLoading },
    { ...MOOD_LANES[2], items: skincarePreview?.items || [], loading: skincarePreviewLoading },
  ];
  const standoutDupes = [...(featuredDupes || [])]
    .sort((left, right) => right.savings - left.savings || right.similarity - left.similarity)
    .slice(0, 3);
  const moodRailLoading = moodLanes.some(lane => lane.loading && lane.items.length === 0);

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
            <SectionHeader
              title="Category Lanes"
              loading={categoriesLoading && !data?.length}
            />

            <View style={styles.categoryGrid}>
              {categories.map((category, index) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  wide={categories.length % 2 === 1 && index === categories.length - 1}
                  onPress={() => openCategory(category.productType, category.name)}
                />
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.sectionBlock}>
            <SectionHeader
              title="Standout Dupe Picks"
              loading={featuredDupesLoading && standoutDupes.length === 0}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {standoutDupes.length > 0 ? (
                standoutDupes.map(item => (
                  <StandoutDupeCard
                    key={item.id}
                    item={item}
                    onPress={() =>
                      router.push({
                        pathname: '/productDetails',
                        params: {
                          originalId: item.original.id,
                          dupeProductId: item.dupe.id,
                          similarity: String(item.similarity),
                          matchReason: item.matchReason || '',
                          savings: String(item.savings),
                        },
                      })
                    }
                  />
                ))
              ) : featuredDupesLoading ? (
                [0, 1, 2].map(index => <StandoutDupeSkeletonCard key={index} />)
              ) : (
                <RailEmptyCard
                  title="Standout comparisons are still warming up."
                />
              )}
            </ScrollView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(350)} style={styles.sectionBlock}>
            <SectionHeader
              title="Browse By Mood"
              loading={moodRailLoading}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {moodLanes.map(lane => (
                <MoodLaneCard
                  key={lane.id}
                  title={lane.title}
                  items={lane.items}
                  loading={lane.loading}
                  onPress={() => openCategory(lane.category, lane.title)}
                />
              ))}
            </ScrollView>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
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
  categoryTileInner: {
    minHeight: 116,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  categoryOrb: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    right: -18,
    top: -18,
    backgroundColor: 'rgba(42,11,38,0.08)',
  },
  categoryOrbDark: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  categoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  categoryCount: {
    ...typography.captionBold,
    color: colors.primary,
  },
  categoryCountDark: {
    color: colors.cream,
  },
  categoryCountSkeleton: {
    alignSelf: 'flex-end',
  },
  categoryBottomRow: {
    gap: spacing.xs,
  },
  categoryName: {
    ...typography.h3,
    color: colors.text,
    textTransform: 'uppercase',
  },
  categoryNameDark: {
    color: colors.surface,
  },
  categoryMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  categoryMetaDark: {
    color: colors.cream,
  },
  rail: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  dupeRailCard: {
    width: 270,
    minHeight: 178,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  dupeMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dupeMetricPill: {
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dupeMetricPillAccent: {
    backgroundColor: colors.pink,
  },
  dupeMetricText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  dupeRailTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.md,
  },
  dupeRailSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  dupeRailFoot: {
    ...typography.smallBold,
    color: colors.accent,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  emptyRailCard: {
    width: 270,
    minHeight: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyRailTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  moodRailCard: {
    width: 252,
    minHeight: 168,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  moodCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  moodRailTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    flex: 1,
  },
  moodCountBadge: {
    minWidth: 34,
    borderRadius: radius.full,
    backgroundColor: colors.softGold,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  moodCountText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  moodTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  moodTag: {
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: '100%',
  },
  moodTagText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  moodEmptyBox: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    padding: spacing.md,
  },
  moodEmptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  moodRailFoot: {
    ...typography.smallBold,
    color: colors.accent,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
});
