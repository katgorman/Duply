import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Heart, Trash2 } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useFavorites } from '../../hooks/useFavorites';

const IMAGE_BLURHASH = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites, loaded, removeFavorite, clearFavorites } = useFavorites();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Saved</Text>
          <Text style={styles.subtitle}>
            {favorites.length} favorite{favorites.length === 1 ? '' : 's'} saved
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
        {!loaded ? null : favorites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyState}>
              <View style={styles.iconCircle}>
                <Heart width={36} height={36} stroke={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>No favorites saved yet</Text>
              <Link href="/search" asChild>
                <Pressable style={styles.button}>
                  <Text style={styles.buttonText}>Explore</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Favorites</Text>
              <Text style={styles.sectionSubtitle}>{favorites.length} saved</Text>
            </View>

            {favorites.map((item, index) => (
              <FavoriteCard
                key={item.id}
                item={item}
                index={index}
                onOpen={() =>
                  router.push({
                    pathname: '/productDetails',
                    params: {
                      id: item.originalId || item.id,
                      productName: item.originalName,
                    },
                  })
                }
                onRemove={() => removeFavorite(item.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(280)}>
      <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]} onPress={onOpen}>
        {item.originalImage ? (
          <Image
            source={{ uri: item.originalImage }}
            style={styles.cardImage}
            contentFit="cover"
            placeholder={{ blurhash: IMAGE_BLURHASH }}
            transition={220}
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={styles.cardImagePlaceholderText}>Image unavailable</Text>
          </View>
        )}

        <View style={styles.cardInfo}>
          <View style={styles.badgeRow}>
            <View style={styles.kindBadge}>
              <Text style={styles.kindBadgeText}>Product</Text>
            </View>
          </View>

          <Text style={styles.cardBrand}>{item.originalBrand}</Text>
          <Text style={styles.cardName} numberOfLines={2}>
            {item.originalName}
          </Text>

          <View style={styles.cardRow}>
            <Text style={styles.cardPrice}>
              ${item.originalPrice.toFixed(2)}
            </Text>
            <Text style={styles.secondaryMeta}>Saved product page</Text>
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
    textAlign: 'center',
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
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  cardImagePlaceholderText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
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
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardPrice: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  secondaryMeta: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  removeBtn: {
    padding: spacing.xs,
  },
});
