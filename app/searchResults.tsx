import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { usePreferences } from '../hooks/usePreferences';
import type { Dupe, Product } from '../services/api';
import {
  dataService,
  getCachedDupesForProduct,
  getCachedProductById,
  prefetchDupesForProduct,
  prefetchPriceMatchesForProduct,
  prefetchProductById,
  prefetchProductsById,
  seedProductCache,
} from '../services/api';

const IMAGE_BLURHASH = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

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
  const cachedSourceProduct = params.productId ? getCachedProductById(params.productId) : null;
  const cachedDupes = getCachedDupesForProduct(cachedSourceProduct);

  const [dupes, setDupes] = useState<Dupe[]>(cachedDupes || []);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(!cachedDupes);
  const [error, setError] = useState<string | null>(null);
  const [sourceProduct, setSourceProduct] = useState<Product | null>(cachedSourceProduct);
  const { showHigherPricedMatches } = usePreferences();
  const isInitialLoading = loading && dupes.length === 0;
  const isRefreshingResults = loading && dupes.length > 0;

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
      prefetchPriceMatchesForProduct(product);
      const foundDupes = await dataService.findDupes(product);
      setDupes(
        foundDupes.filter(item => (
          showHigherPricedMatches
            ? true
            : item.dupe.price <= item.original.price
        ))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.productId, params.q, showHigherPricedMatches]);

  useEffect(() => {
    loadDupes();
  }, [loadDupes]);

  useEffect(() => {
    if (cachedSourceProduct) {
      setSourceProduct(prev => prev || cachedSourceProduct);
      if (cachedDupes?.length) {
        setDupes(prev => prev.length > 0 ? prev : cachedDupes);
      } else {
        prefetchDupesForProduct(cachedSourceProduct);
      }
    }
  }, [cachedDupes, cachedSourceProduct]);

  useEffect(() => {
    if (sourceProduct) {
      seedProductCache(sourceProduct);
      prefetchProductById(sourceProduct.id);
      prefetchDupesForProduct(sourceProduct);
      prefetchPriceMatchesForProduct(sourceProduct);
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
        style={[styles.card, viewMode === 'grid' ? styles.cardGrid : styles.cardList]}
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
          <Image
            source={{ uri: item.dupe.image }}
            style={[styles.imageBox, viewMode === 'grid' && styles.imageBoxGrid]}
            contentFit="cover"
            placeholder={{ blurhash: IMAGE_BLURHASH }}
            transition={220}
          />
        ) : (
          <View style={[styles.imageBox, viewMode === 'grid' && styles.imageBoxGrid, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
          </View>
        )}
        <View style={[styles.info, viewMode === 'grid' && styles.infoGrid]}>
          <Text style={styles.brand}>{item.dupe.brand}</Text>
          <Text style={styles.name} numberOfLines={2}>{item.dupe.familyName || item.dupe.name}</Text>
          <View style={styles.matchRow}>
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>{item.similarity}% match</Text>
            </View>
          </View>
          {item.matchReason ? (
            <Text style={styles.matchReason} numberOfLines={2}>{item.matchReason}</Text>
          ) : null}
        </View>
        <View style={[styles.priceCol, viewMode === 'grid' && styles.priceColGrid]}>
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
            {sourceProduct?.familyName || sourceProduct?.name || params.productName || params.q || 'Results'}
          </Text>
          <Text style={styles.headerSub}>
            {loading && dupes.length > 0 ? 'Refreshing dupes...' : `${dupes.length} dupes ready to compare`}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.viewModeWrap}>
        {(['list', 'grid'] as const).map(mode => {
          const active = viewMode === mode;
          return (
            <TouchableOpacity
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[styles.viewModeChip, active && styles.viewModeChipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.viewModeChipText, active && styles.viewModeChipTextActive]}>
                {mode === 'list' ? 'List View' : 'Grid View'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isInitialLoading ? (
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
          key={`dupes-${viewMode}`}
          data={dupes}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, viewMode === 'grid' && styles.gridList]}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isRefreshingResults ? (
              <View style={styles.inlineLoadingPill}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.inlineLoadingText}>Refreshing dupes...</Text>
              </View>
            ) : null
          }
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
  viewModeWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  viewModeChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  viewModeChipActive: {
    backgroundColor: colors.primary,
  },
  viewModeChipText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  viewModeChipTextActive: {
    color: colors.textOnPrimary,
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
  gridList: {
    paddingBottom: spacing.xxxl,
  },
  gridRow: {
    gap: spacing.md,
  },
  inlineLoadingPill: {
    alignSelf: 'center',
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  inlineLoadingText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  cardList: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardGrid: {
    flex: 1,
  },
  imageBox: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.skeleton,
  },
  imageBoxGrid: {
    width: '100%',
    height: 144,
    marginBottom: spacing.md,
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
  infoGrid: {
    marginHorizontal: 0,
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
  priceColGrid: {
    alignItems: 'flex-start',
    marginTop: spacing.sm,
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
