import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import type { Dupe, Product } from '../services/api';
import { dataService, prefetchProductsById, seedProductCache } from '../services/api';

function LoadingDot({ delay = 0 }: { delay?: number }) {
  const bounce = useSharedValue(0);

  useEffect(() => {
    bounce.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      )
    );
  }, [bounce, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 * bounce.value }],
    opacity: 0.45 + (bounce.value * 0.55),
  }));

  return <Animated.View style={[styles.loadingDot, animatedStyle]} />;
}

export default function SearchResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; productId?: string; productName?: string }>();

  const [dupes, setDupes] = useState<Dupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceProduct, setSourceProduct] = useState<Product | null>(null);

  const loadDupes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let product: Product | null = null;

      if (params.productId) {
        product = await dataService.getProductById(params.productId);
      } else if (params.q) {
        const results = await dataService.searchProducts(params.q);
        product = results[0] ?? null;
      }

      if (!product) {
        setError('No product found');
        setLoading(false);
        return;
      }

      setSourceProduct(product);
      const foundDupes = await dataService.findDupes(product);
      setDupes(foundDupes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.productId, params.q]);

  useEffect(() => {
    loadDupes();
  }, [loadDupes]);

  useEffect(() => {
    if (sourceProduct) {
      seedProductCache(sourceProduct);
    }
    dupes.forEach(item => {
      seedProductCache(item.original);
      seedProductCache(item.dupe);
    });
    prefetchProductsById([
      ...dupes.flatMap(item => [item.original.id, item.dupe.id]),
    ]);
  }, [dupes, sourceProduct]);

  const renderItem = ({ item, index }: { item: Dupe; index: number }) => (
    <Animated.View entering={FadeInRight.delay(index * 80).duration(400)}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
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
        {item.dupe.image ? (
          <Image source={{ uri: item.dupe.image }} style={styles.imageBox} contentFit="cover" />
        ) : (
          <View style={[styles.imageBox, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.brand}>{item.dupe.brand}</Text>
          <Text style={styles.name} numberOfLines={2}>{item.dupe.name}</Text>
          <View style={styles.matchRow}>
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>{item.similarity}% match</Text>
            </View>
          </View>
          {item.matchReason ? (
            <Text style={styles.matchReason} numberOfLines={2}>{item.matchReason}</Text>
          ) : null}
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.dupePrice}>${item.dupe.price.toFixed(2)}</Text>
          <Text style={styles.origPrice}>${item.original.price.toFixed(2)}</Text>
          {Math.max(item.original.price - item.dupe.price, 0) > 0 ? (
            <Text style={styles.savingsText}>Save ${Math.max(item.original.price - item.dupe.price, 0).toFixed(2)}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {sourceProduct?.name || params.productName || params.q || 'Results'}
          </Text>
          {!loading && (
            <Text style={styles.headerSub}>{dupes.length} dupes ready to compare</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingTitle}>Finding dupes</Text>
          <Text style={styles.loadingSubtitle}>Running the selected product through the model.</Text>
          <View style={styles.loadingDotsRow}>
            <LoadingDot delay={0} />
            <LoadingDot delay={120} />
            <LoadingDot delay={240} />
          </View>
        </View>
      ) : error ? (
        <View style={styles.centerMessage}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadDupes} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : dupes.length === 0 ? (
        <View style={styles.centerMessage}>
          <Text style={{ fontSize: 48, marginBottom: spacing.lg }}>🔍</Text>
          <Text style={styles.emptyTitle}>No dupes found</Text>
          <Text style={styles.emptySubtitle}>Try searching for a different product</Text>
        </View>
      ) : (
        <FlatList
          data={dupes}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  backBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  headerSub: {
    ...typography.small,
    color: colors.accent,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingTitle: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
  },
  loadingSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  loadingDotsRow: {
    alignItems: 'center',
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  retryText: {
    color: colors.textOnPrimary,
    ...typography.captionBold,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  imageBox: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.skeleton,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  imagePlaceholderText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  info: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  brand: {
    ...typography.small,
    color: colors.accentDark,
    textTransform: 'uppercase',
  },
  name: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 2,
  },
  matchRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  matchBadge: {
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  matchText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
  },
  matchReason: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  dupePrice: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  origPrice: {
    ...typography.small,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  savingsText: {
    ...typography.small,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
});
