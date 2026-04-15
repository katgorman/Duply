import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Heart, Trash2 } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useFavorites } from '../../hooks/useFavorites';

export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites, loaded, removeFavorite, clearFavorites } = useFavorites();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Favorites</Text>
          <Text style={styles.subtitle}>{favorites.length} saved item{favorites.length === 1 ? '' : 's'}</Text>
        </View>
        {favorites.length > 0 ? (
          <Pressable onPress={clearFavorites} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      {!loaded ? null : favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyState}>
            <View style={styles.iconCircle}>
              <Heart width={36} height={36} stroke={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Text style={styles.emptySubtitle}>
              Save full product pages or dupe comparisons and they’ll live here.
            </Text>
            <Link href="/search" asChild>
              <Pressable style={styles.button}>
                <Text style={styles.buttonText}>Start Exploring</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const isComparison = (item.kind || 'comparison') === 'comparison';

            return (
              <Animated.View entering={FadeInDown.delay(index * 70).duration(280)}>
                <Pressable
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
                  onPress={() =>
                    router.push({
                      pathname: '/productDetails',
                      params: isComparison
                        ? {
                            dupeId: item.id,
                            originalId: item.originalId,
                            dupeProductId: item.dupeProductId,
                            similarity: String(item.similarity),
                            matchReason: item.matchReason || '',
                            savings: String(item.savings),
                          }
                        : {
                            id: item.originalId || item.id,
                            productName: item.originalName,
                          },
                    })
                  }
                >
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
                        <Text style={styles.secondaryMeta}>Save ${item.savings.toFixed(2)}</Text>
                      ) : (
                        <Text style={styles.secondaryMeta}>Saved product page</Text>
                      )}
                    </View>
                  </View>

                  <Pressable
                    onPress={() => removeFavorite(item.id)}
                    style={styles.removeBtn}
                    hitSlop={12}
                  >
                    <Trash2 width={18} height={18} stroke={colors.textMuted} />
                  </Pressable>
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}
    </SafeAreaView>
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
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  clearText: {
    ...typography.smallBold,
    color: colors.primary,
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
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
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
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
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
    backgroundColor: colors.lime,
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
