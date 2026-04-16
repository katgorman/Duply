import { Image } from 'expo-image';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Heart, Star, Trash2 } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useFavorites } from '../../hooks/useFavorites';

type SavedView = 'favorites' | 'comparisons';

export default function FavoritesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const { favorites, loaded, removeFavorite, clearFavorites } = useFavorites();
  const productFavorites = favorites.filter(item => (item.kind || 'comparison') === 'product');
  const comparisonFavorites = favorites.filter(item => (item.kind || 'comparison') === 'comparison');
  const [activeView, setActiveView] = useState<SavedView>(
    params.view === 'comparisons' ? 'comparisons' : 'favorites'
  );

  useEffect(() => {
    setActiveView(params.view === 'comparisons' ? 'comparisons' : 'favorites');
  }, [params.view]);

  const activeItems = activeView === 'favorites' ? productFavorites : comparisonFavorites;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Saved</Text>
          <Text style={styles.subtitle}>
            {activeItems.length} {activeView === 'favorites' ? 'favorite' : 'comparison'}
            {activeItems.length === 1 ? '' : 's'} saved
          </Text>
        </View>
        {favorites.length > 0 ? (
          <Pressable onPress={clearFavorites} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.chooserCard}>
          <Text style={styles.chooserTitle}>Choose a saved view</Text>
          <Text style={styles.chooserSubtitle}>Open your saved favorites or your saved dupe comparisons.</Text>

          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setActiveView('favorites')}
              style={[styles.viewToggleButton, activeView === 'favorites' && styles.viewToggleButtonActive]}
            >
              <Heart width={16} height={16} stroke={activeView === 'favorites' ? colors.textOnPrimary : colors.primary} />
              <View>
                <Text style={[styles.viewToggleText, activeView === 'favorites' && styles.viewToggleTextActive]}>Favorites</Text>
                <Text style={[styles.viewToggleMeta, activeView === 'favorites' && styles.viewToggleMetaActive]}>
                  {productFavorites.length} saved
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setActiveView('comparisons')}
              style={[styles.viewToggleButton, activeView === 'comparisons' && styles.viewToggleButtonActive]}
            >
              <Star width={16} height={16} stroke={activeView === 'comparisons' ? colors.textOnPrimary : colors.primary} />
              <View>
                <Text style={[styles.viewToggleText, activeView === 'comparisons' && styles.viewToggleTextActive]}>Comparisons</Text>
                <Text style={[styles.viewToggleMeta, activeView === 'comparisons' && styles.viewToggleMetaActive]}>
                  {comparisonFavorites.length} saved
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {!loaded ? null : activeItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyState}>
              <View style={styles.iconCircle}>
                {activeView === 'favorites' ? (
                  <Heart width={36} height={36} stroke={colors.accent} />
                ) : (
                  <Star width={36} height={36} stroke={colors.accent} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {activeView === 'favorites' ? 'No favorites saved yet' : 'No comparisons saved yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeView === 'favorites'
                  ? 'Tap the heart on a product page to save it here.'
                  : 'Tap the star on a dupe comparison page to save the full comparison here.'}
              </Text>
              <Link href="/search" asChild>
                <Pressable style={styles.button}>
                  <Text style={styles.buttonText}>Start Exploring</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        ) : (
          <SavedSection
            title={activeView === 'favorites' ? 'Favorites' : 'Saved Comparisons'}
            subtitle={`${activeItems.length} saved`}
            items={activeItems}
            removeFavorite={removeFavorite}
            onOpen={(item) =>
              activeView === 'favorites'
                ? router.push({
                    pathname: '/productDetails',
                    params: {
                      id: item.originalId || item.id,
                      productName: item.originalName,
                    },
                  })
                : router.push({
                    pathname: '/productDetails',
                    params: {
                      dupeId: item.id,
                      originalId: item.originalId,
                      dupeProductId: item.dupeProductId,
                      similarity: String(item.similarity),
                      matchReason: item.matchReason || '',
                      savings: String(item.savings),
                    },
                  })
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SavedSection({
  title,
  subtitle,
  items,
  removeFavorite,
  onOpen,
}: {
  title: string;
  subtitle: string;
  items: ReturnType<typeof useFavorites>['favorites'];
  removeFavorite: (id: string) => void;
  onOpen: (item: ReturnType<typeof useFavorites>['favorites'][number]) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>

      {items.map((item, index) => (
        <FavoriteCard
          key={item.id}
          item={item}
          index={index}
          onOpen={() => onOpen(item)}
          onRemove={() => removeFavorite(item.id)}
        />
      ))}
    </View>
  );
}

function FavoriteCard({
  item,
  index,
  onOpen,
  onRemove,
}: {
  item: ReturnType<typeof useFavorites>['favorites'][number];
  index: number;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const isComparison = (item.kind || 'comparison') === 'comparison';

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(280)}>
      <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]} onPress={onOpen}>
        <Image
          source={{ uri: isComparison ? item.dupeImage : item.originalImage }}
          style={styles.cardImage}
          contentFit="cover"
        />

        <View style={styles.cardInfo}>
          <View style={styles.badgeRow}>
            <View style={[styles.kindBadge, isComparison ? styles.comparisonBadge : styles.productBadge]}>
              <Text style={styles.kindBadgeText}>{isComparison ? 'Comparison' : 'Product'}</Text>
            </View>
          </View>

          <Text style={styles.cardBrand}>{isComparison ? item.dupeBrand : item.originalBrand}</Text>
          <Text style={styles.cardName} numberOfLines={2}>
            {isComparison ? item.dupeName : item.originalName}
          </Text>

          <View style={styles.cardRow}>
            <Text style={styles.cardPrice}>
              ${(isComparison ? item.dupePrice : item.originalPrice).toFixed(2)}
            </Text>
            {isComparison ? (
              <Text style={styles.secondaryMeta}>Saved comparison and price-match view</Text>
            ) : (
              <Text style={styles.secondaryMeta}>Saved product page</Text>
            )}
          </View>
        </View>

        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={12}>
          <Trash2 width={18} height={18} stroke={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  title: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  subtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  clearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  clearText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  chooserCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  chooserTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  chooserSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  viewToggle: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  viewToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.primary,
  },
  viewToggleText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  viewToggleTextActive: {
    color: colors.textOnPrimary,
  },
  viewToggleMeta: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  viewToggleMetaActive: {
    color: colors.textOnPrimary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadows.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  button: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.textOnPrimary,
    ...typography.captionBold,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    ...typography.small,
    color: colors.textMuted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.skeleton,
  },
  cardInfo: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  kindBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  comparisonBadge: {
    backgroundColor: colors.cream,
  },
  productBadge: {
    backgroundColor: colors.accentLight,
  },
  kindBadgeText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  cardBrand: {
    ...typography.small,
    color: colors.textMuted,
  },
  cardName: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  cardPrice: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  secondaryMeta: {
    ...typography.small,
    color: colors.textSecondary,
  },
  removeBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
});
