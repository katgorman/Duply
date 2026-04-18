import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCategories, useFeaturedDupes, useProductsByCategory } from '../../hooks/useProducts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { prefetchCategoryPage } from '../../services/api';

const FALLBACK_CATEGORIES = [
  { id: 'eyes', name: 'Eyes', emoji: '', productType: 'eyes', color: '#FFF9F0' },
  { id: 'lips', name: 'Lips', emoji: '', productType: 'lips', color: '#FFE4F0' },
  { id: 'face', name: 'Face', emoji: '', productType: 'face', color: '#F7C6D9' },
  { id: 'skincare', name: 'Skincare', emoji: '', productType: 'skincare', color: '#FFF6F9' },
  { id: 'other', name: 'Other', emoji: '', productType: 'other', color: '#2A0B26' },
];

export default function CategoriesScreen() {
  const router = useRouter();
  const { data } = useCategories();
  const { data: featuredDupes } = useFeaturedDupes();
  const { data: lipsPreview } = useProductsByCategory('lips', { page: 1, pageSize: 3, sort: 'popular' });
  const { data: facePreview } = useProductsByCategory('face', { page: 1, pageSize: 3, sort: 'popular' });
  const { data: skincarePreview } = useProductsByCategory('skincare', { page: 1, pageSize: 3, sort: 'popular' });
  const categories = data?.length ? data : FALLBACK_CATEGORIES;
  const discoveryRows = [
    { id: 'lips-preview', title: 'Luxury Lip Alternatives', subtitle: 'Popular lips people compare first', category: 'lips', items: lipsPreview?.items || [] },
    { id: 'face-preview', title: 'Face Base Refresh', subtitle: 'Foundation and complexion staples', category: 'face', items: facePreview?.items || [] },
    { id: 'skincare-preview', title: 'Skincare Standouts', subtitle: 'Routine-friendly discovery picks', category: 'skincare', items: skincarePreview?.items || [] },
  ].filter(section => section.items.length > 0);
  const standoutDupes = [...(featuredDupes || [])]
    .sort((left, right) => right.savings - left.savings || right.similarity - left.similarity)
    .slice(0, 3);

  useEffect(() => {
    categories.forEach(category => {
      void prefetchCategoryPage(category.productType, { page: 1, pageSize: 12, sort: 'popular' });
    });
  }, [categories]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Categories</Text>
        <Text style={styles.subtitle}>Browse every category with real product totals.</Text>
      </View>

      <View style={styles.content}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {standoutDupes.length > 0 ? (
            <View style={styles.discoverySection}>
              <Text style={styles.sectionTitle}>Standout Dupe Picks</Text>
              <Text style={styles.sectionSubtitle}>High-signal matches with the strongest savings right now.</Text>
              {standoutDupes.map((item, index) => (
                <Animated.View key={item.id} entering={FadeInDown.delay(index * 80).duration(350)}>
                  <Pressable
                    style={({ pressed }) => [styles.dupeFeatureCard, pressed && styles.cardPressed]}
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
                  >
                    <View style={styles.dupeFeatureTop}>
                      <View style={styles.dupeMetricPill}>
                        <Text style={styles.dupeMetricText}>{item.similarity}% match</Text>
                      </View>
                      <View style={[styles.dupeMetricPill, styles.dupeMetricPillAccent]}>
                        <Text style={styles.dupeMetricText}>Save ${item.savings.toFixed(2)}</Text>
                      </View>
                    </View>
                    <Text style={styles.dupeFeatureTitle} numberOfLines={2}>
                      {item.original.familyName || item.original.name}
                    </Text>
                    <Text style={styles.dupeFeatureSubtitle} numberOfLines={2}>
                      Try {item.dupe.brand} {item.dupe.familyName || item.dupe.name}
                    </Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : null}

          {categories.map((cat, i) => (
            <Animated.View key={cat.id} entering={FadeInDown.delay(i * 100).duration(400)}>
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() =>
                  router.push({
                    pathname: '/categoryProducts',
                    params: { category: cat.productType, title: cat.name },
                  })
                }
              >
                <View style={[styles.cardGradient, { backgroundColor: cat.color }]}>
                  <Text style={[styles.cardText, cat.id === 'other' && styles.cardTextDark]}>{cat.name}</Text>
                  <Text style={[styles.cardCount, cat.id === 'other' && styles.cardCountDark]}>
                    {typeof cat.count === 'number' ? `${cat.count.toLocaleString()} results` : 'Browse products'}
                  </Text>
                  <Text style={[styles.cardStar, cat.id === 'other' && styles.cardStarDark]}>*</Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}

          {discoveryRows.length > 0 ? (
            <View style={styles.discoverySection}>
              <Text style={styles.sectionTitle}>Browse By Mood</Text>
              <Text style={styles.sectionSubtitle}>Category pages now lead with stronger discovery instead of just long lists.</Text>
              {discoveryRows.map((section, index) => (
                <Animated.View key={section.id} entering={FadeInDown.delay(index * 90).duration(350)}>
                  <Pressable
                    style={({ pressed }) => [styles.discoveryCard, pressed && styles.cardPressed]}
                    onPress={() =>
                      router.push({
                        pathname: '/categoryProducts',
                        params: { category: section.category, title: section.title },
                      })
                    }
                  >
                    <Text style={styles.discoveryTitle}>{section.title}</Text>
                    <Text style={styles.discoverySubtitle}>{section.subtitle}</Text>
                    <View style={styles.discoveryTagRow}>
                      {section.items.slice(0, 3).map(item => (
                        <View key={item.id} style={styles.discoveryTag}>
                          <Text style={styles.discoveryTagText} numberOfLines={1}>
                            {item.familyName || item.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : null}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.pink,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
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
  discoverySection: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cardGradient: {
    height: 124,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cardText: {
    ...typography.h2,
    color: colors.text,
    textTransform: 'uppercase',
    textAlign: 'center',
    zIndex: 1,
  },
  cardCount: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    zIndex: 1,
  },
  cardCountDark: {
    color: colors.cream,
  },
  cardTextDark: {
    color: colors.surface,
  },
  cardStar: {
    position: 'absolute',
    right: spacing.xl,
    bottom: -4,
    fontSize: 76,
    color: colors.primary,
    lineHeight: 82,
  },
  cardStarDark: {
    color: colors.cream,
  },
  dupeFeatureCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    ...shadows.md,
  },
  dupeFeatureTop: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dupeMetricPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
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
  dupeFeatureTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  dupeFeatureSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  discoveryCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    ...shadows.sm,
  },
  discoveryTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    textAlign: 'center',
  },
  discoverySubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  discoveryTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  discoveryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  discoveryTagText: {
    ...typography.small,
    color: colors.textSecondary,
  },
});
