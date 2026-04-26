import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import { usePreferences } from '../hooks/usePreferences';
import type { Dupe, Product } from '../services/api';
import { getDupeCallout } from '../services/dupeInsights';
import {
  dataService,
  getCachedDupesForProduct,
  getCachedProductById,
  prefetchDupesForProduct,
  prefetchProductById,
  prefetchProductsById,
  seedProductCache,
} from '../services/api';
import { buildProductImageSource } from '../services/productImages';

const IMAGE_BLURHASH = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

type DupeStage = 'resolving' | 'matching' | 'finalizing';

const DUPE_STAGE_ORDER: DupeStage[] = ['resolving', 'matching', 'finalizing'];

const DUPE_STAGE_COPY: Record<DupeStage, { badge: string; title: string; description: string }> = {
  resolving: {
    badge: 'Loading source',
    title: 'Looking up your product',
    description: 'Finding your product in the catalog. This usually takes 5–15 seconds.',
  },
  matching: {
    badge: 'Finding dupes',
    title: 'Searching the catalog',
    description: 'Comparing products by type, category, price, and rating. Hang tight.',
  },
  finalizing: {
    badge: 'Sorting results',
    title: 'Sorting the results',
    description: 'Sorting the best matches to the top. Almost there.',
  },
};

function filterVisibleDupes(items: Dupe[], showHigherPricedMatches: boolean) {
  return items.filter(item => (
    showHigherPricedMatches
      ? true
      : item.dupe.price <= item.original.price
  ));
}

function DupeLoader({
  sourceProduct,
  fallbackName,
  stage,
  compact,
}: {
  sourceProduct: Product | null;
  fallbackName?: string;
  stage: DupeStage;
  compact: boolean;
}) {
  const stageCopy = DUPE_STAGE_COPY[stage];
  const activeStageIndex = DUPE_STAGE_ORDER.indexOf(stage);
  const sourceImageSource = buildProductImageSource(sourceProduct?.image, 520);
  const sourceTitle = sourceProduct?.familyName || sourceProduct?.name || fallbackName || 'Finding your product';

  return (
    <View style={styles.loadingExperience}>
      <View style={[styles.loadingHeroCard, compact && styles.loadingHeroCardCompact]}>
        {sourceImageSource ? (
          <Image
            source={sourceImageSource}
            style={[styles.loadingHeroImage, compact && styles.loadingHeroImageCompact]}
            contentFit="contain"
            placeholder={{ blurhash: IMAGE_BLURHASH }}
            transition={180}
          />
        ) : (
          <View style={[styles.loadingHeroImage, compact && styles.loadingHeroImageCompact, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Preparing item</Text>
          </View>
        )}
        <View style={styles.loadingHeroCopy}>
          <Text style={styles.loadingEyebrow}>Building your dupe list</Text>
          <Text style={styles.loadingTitle}>{sourceTitle}</Text>
          <Text style={styles.loadingSubtitle}>{stageCopy.title}</Text>
          <Text style={styles.loadingBody}>{stageCopy.description}</Text>
        </View>
      </View>

      <View style={styles.loadingStatusPill}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingStatusText}>{stageCopy.badge}</Text>
      </View>

      <View style={styles.loadingTimeline}>
        {DUPE_STAGE_ORDER.map((step, index) => {
          const isActive = index === activeStageIndex;
          const isComplete = index < activeStageIndex;
          return (
            <View
              key={step}
              style={[
                styles.loadingTimelineStep,
                isActive && styles.loadingTimelineStepActive,
                isComplete && styles.loadingTimelineStepComplete,
              ]}
            >
              <View
                style={[
                  styles.loadingTimelineDot,
                  isActive && styles.loadingTimelineDotActive,
                  isComplete && styles.loadingTimelineDotComplete,
                ]}
              />
              <Text
                style={[
                  styles.loadingTimelineText,
                  isActive && styles.loadingTimelineTextActive,
                  isComplete && styles.loadingTimelineTextComplete,
                ]}
              >
                {DUPE_STAGE_COPY[step].badge}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.loadingTimingNote}>
        <Text style={styles.loadingTimingNoteText}>
          Results usually take 5–15 seconds.
        </Text>
      </View>

      {[0, 1, 2].map(index => (
        <View
          key={index}
          style={[
            styles.loadingCard,
            index === 0 && styles.loadingCardFeatured,
          ]}
        >
          <View style={styles.loadingImage} />
          <View style={styles.loadingInfo}>
            <View style={[styles.loadingLine, styles.loadingBrandLine]} />
            <View style={[styles.loadingLine, styles.loadingNameLine]} />
            <View style={[styles.loadingLine, styles.loadingReasonLine]} />
          </View>
          <View style={styles.loadingPriceCol}>
            <View style={[styles.loadingLine, styles.loadingPriceLine]} />
            <View style={[styles.loadingLine, styles.loadingSavingsLine]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function SearchResultsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ q?: string; productId?: string; productName?: string }>();
  const cachedSourceProduct = params.productId ? getCachedProductById(params.productId) : null;
  const cachedDupes = getCachedDupesForProduct(cachedSourceProduct);
  const { showHigherPricedMatches } = usePreferences();
  const initialCachedDupes = filterVisibleDupes(cachedDupes || [], showHigherPricedMatches);

  const [dupes, setDupes] = useState<Dupe[]>(initialCachedDupes);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(initialCachedDupes.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [sourceProduct, setSourceProduct] = useState<Product | null>(cachedSourceProduct);
  const [dupeStage, setDupeStage] = useState<DupeStage>(cachedSourceProduct ? 'matching' : 'resolving');
  const isCompactScreen = width < 390;
  const gridColumns = viewMode === 'grid' ? (isCompactScreen ? 1 : 2) : 1;
  const listImageSize = isCompactScreen ? 92 : 112;
  const gridImageHeight = isCompactScreen ? 188 : 228;
  const sourceSummaryImageSource = buildProductImageSource(sourceProduct?.image, 520);
  const isInitialLoading = loading && dupes.length === 0;
  const isRefreshingResults = loading && dupes.length > 0;

  const loadDupes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let product: Product | null = cachedSourceProduct ?? null;

      if (product) {
        setSourceProduct(prev => prev || product);
        setDupeStage('matching');
      } else if (params.productId) {
        setDupeStage('resolving');
        product = await dataService.getProductById(params.productId);
      } else if (params.q) {
        setDupeStage('resolving');
        const results = await dataService.searchProducts(params.q);
        product = results[0] ?? null;
      }

      if (!product) {
        setError('No product found');
        setLoading(false);
        return;
      }

      setSourceProduct(product);
      setDupeStage('matching');
      const foundDupes = await dataService.findDupes(product);
      setDupeStage('finalizing');
      setDupes(filterVisibleDupes(foundDupes, showHigherPricedMatches));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cachedSourceProduct, params.productId, params.q, showHigherPricedMatches]);

  useEffect(() => {
    loadDupes();
  }, [loadDupes]);

  useEffect(() => {
    if (cachedSourceProduct) {
      setSourceProduct(prev => prev || cachedSourceProduct);
      const nextCachedDupes = filterVisibleDupes(cachedDupes || [], showHigherPricedMatches);
      if (nextCachedDupes.length) {
        setDupes(nextCachedDupes);
      } else {
        setDupeStage('matching');
        prefetchDupesForProduct(cachedSourceProduct);
      }
    }
  }, [cachedDupes, cachedSourceProduct, showHigherPricedMatches]);

  useEffect(() => {
    if (sourceProduct) {
      seedProductCache(sourceProduct);
      prefetchProductById(sourceProduct.id);
      prefetchDupesForProduct(sourceProduct);
    }
    dupes.slice(0, 4).forEach(item => {
      seedProductCache(item.original);
      seedProductCache(item.dupe);
    });
    prefetchProductsById([
      ...dupes.slice(0, 4).flatMap(item => [item.original.id, item.dupe.id]),
    ]);
  }, [dupes, sourceProduct]);

  const renderItem = ({ item }: { item: Dupe }) => {
    const callout = getDupeCallout(item);
    const imageSource = buildProductImageSource(
      item.dupe.image,
      viewMode === 'grid' ? gridImageHeight * 2 : listImageSize * 2,
    );

    return (
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
        {imageSource ? (
          <Image
            source={imageSource}
            style={[
              styles.imageBox,
              viewMode === 'grid'
                ? [styles.imageBoxGrid, { height: gridImageHeight }]
                : { width: listImageSize, height: listImageSize },
            ]}
            contentFit="contain"
            placeholder={{ blurhash: IMAGE_BLURHASH }}
            transition={220}
          />
        ) : (
          <View
            style={[
              styles.imageBox,
              viewMode === 'grid'
                ? [styles.imageBoxGrid, { height: gridImageHeight }]
                : { width: listImageSize, height: listImageSize },
              styles.imagePlaceholder,
            ]}
          >
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
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceBadgeText}>{callout.confidence}</Text>
            </View>
          </View>
          {callout.reasonLabels.length > 0 ? (
            <View style={styles.reasonChips}>
              {callout.reasonLabels.slice(0, 2).map(label => (
                <View key={label} style={styles.reasonChip}>
                  <Text style={styles.reasonChipText}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.matchReason} numberOfLines={2}>{callout.summary}</Text>
        </View>
        <View style={[styles.priceCol, viewMode === 'grid' && styles.priceColGrid]}>
          <Text style={styles.dupePrice}>${item.dupe.price.toFixed(2)}</Text>
          <Text style={styles.origPrice}>${item.original.price.toFixed(2)}</Text>
          <Text style={styles.savingsText}>{callout.savingsText}</Text>
        </View>
      </TouchableOpacity>
    );
  };

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
            {isInitialLoading
              ? 'Finding the best dupes...'
              : loading && dupes.length > 0
                ? 'Refreshing dupes...'
                : `${dupes.length} dupes ready to compare`}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {!isInitialLoading && sourceProduct ? (
        <View style={styles.sourceSummaryCard}>
          <View style={[styles.sourceSummaryTopRow, isCompactScreen && styles.sourceSummaryTopRowCompact]}>
            {sourceSummaryImageSource ? (
              <Image
                source={sourceSummaryImageSource}
                style={[styles.sourceSummaryImage, isCompactScreen && styles.sourceSummaryImageCompact]}
                contentFit="contain"
                placeholder={{ blurhash: IMAGE_BLURHASH }}
                transition={180}
              />
            ) : (
              <View style={[styles.sourceSummaryImage, isCompactScreen && styles.sourceSummaryImageCompact, styles.imagePlaceholder]}>
                <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
              </View>
            )}
            <View style={styles.sourceSummaryCopy}>
              <Text style={styles.sourceSummaryEyebrow}>Source Product</Text>
              <Text style={styles.sourceSummaryTitle}>{sourceProduct.brand} {sourceProduct.familyName || sourceProduct.name}</Text>
              <Text style={styles.sourceSummaryMeta}>
                {sourceProduct.productType} - ${sourceProduct.price.toFixed(2)}
              </Text>
              <Text style={styles.sourceSummaryBody}>
                {showHigherPricedMatches
                  ? 'Showing all ranked matches, including premium alternatives.'
                  : 'Showing dupes priced at or below the source product by default.'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {!isInitialLoading && dupes.length > 0 ? (
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
      ) : null}

      {isInitialLoading ? (
        <View style={styles.loadingContainer}>
          <DupeLoader
            sourceProduct={sourceProduct}
            fallbackName={params.productName || params.q}
            stage={dupeStage}
            compact={isCompactScreen}
          />
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
          <Text style={styles.emptyTitle}>No dupes found</Text>
          <Text style={styles.emptySubtitle}>
            {showHigherPricedMatches
              ? 'Try another product name, brand, or category search.'
              : 'No cheaper alternatives found. Try enabling "Show Higher Priced Matches" in Settings to see all ranked results.'}
          </Text>
        </View>
      ) : (
        <FlatList
          key={`dupes-${viewMode}-${gridColumns}`}
          data={dupes}
          numColumns={gridColumns}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, viewMode === 'grid' && styles.gridList]}
          columnWrapperStyle={gridColumns > 1 ? styles.gridRow : undefined}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  loadingExperience: {
    gap: spacing.md,
  },
  loadingHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  loadingHeroCardCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  loadingHeroImage: {
    width: 92,
    height: 92,
    borderRadius: radius.lg,
    backgroundColor: colors.skeleton,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingHeroImageCompact: {
    width: '100%',
    height: 180,
  },
  loadingHeroCopy: {
    flex: 1,
  },
  loadingEyebrow: {
    ...typography.smallBold,
    color: colors.accentDark,
    textTransform: 'uppercase',
  },
  loadingTitle: {
    ...typography.h3,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  loadingSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  loadingBody: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  loadingStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  loadingStatusText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  loadingTimeline: {
    gap: spacing.sm,
  },
  loadingTimelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadingTimelineStepActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  loadingTimelineStepComplete: {
    borderColor: colors.primary,
  },
  loadingTimelineDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  loadingTimelineDotActive: {
    backgroundColor: colors.accent,
  },
  loadingTimelineDotComplete: {
    backgroundColor: colors.primary,
  },
  loadingTimelineText: {
    ...typography.small,
    color: colors.textMuted,
  },
  loadingTimelineTextActive: {
    color: colors.primary,
  },
  loadingTimelineTextComplete: {
    color: colors.textSecondary,
  },
  loadingTimingNote: {
    paddingHorizontal: spacing.sm,
  },
  loadingTimingNoteText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  loadingCardFeatured: {
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  loadingImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.skeleton,
  },
  loadingInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  loadingLine: {
    borderRadius: radius.full,
    backgroundColor: colors.skeleton,
  },
  loadingBrandLine: {
    width: '28%',
    height: 12,
  },
  loadingNameLine: {
    width: '80%',
    height: 16,
  },
  loadingReasonLine: {
    width: '62%',
    height: 12,
  },
  loadingPriceCol: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  loadingPriceLine: {
    width: 56,
    height: 16,
  },
  loadingSavingsLine: {
    width: 42,
    height: 12,
  },
  viewModeWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sourceSummaryCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  sourceSummaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sourceSummaryTopRowCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  sourceSummaryImage: {
    width: 92,
    height: 92,
    borderRadius: radius.lg,
    backgroundColor: colors.skeleton,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceSummaryImageCompact: {
    width: '100%',
    height: 180,
  },
  sourceSummaryCopy: {
    flex: 1,
  },
  sourceSummaryEyebrow: {
    ...typography.smallBold,
    color: colors.accentDark,
    textTransform: 'uppercase',
  },
  sourceSummaryTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  sourceSummaryMeta: {
    ...typography.smallBold,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textTransform: 'capitalize',
  },
  sourceSummaryBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
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
    alignItems: 'flex-start',
  },
  cardGrid: {
    flex: 1,
  },
  imageBox: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.skeleton,
    borderWidth: 1,
    borderColor: colors.border,
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
    marginHorizontal: spacing.lg,
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
    flexWrap: 'wrap',
    gap: spacing.xs,
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
  confidenceBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  confidenceBadgeText: {
    ...typography.smallBold,
    color: colors.textOnPrimary,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  reasonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonChipText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  matchReason: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
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
