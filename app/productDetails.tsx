import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import { useActivity } from '../hooks/useActivity';
import { useFavorites } from '../hooks/useFavorites';
import type { PriceOffer, Product } from '../services/api';
import {
  buildComparisonStats,
  getConfidenceBand,
  getConfidenceSummary,
  getMatchReasonLabels,
} from '../services/dupeInsights';
import {
  dataService,
  getCachedPriceMatchesForProduct,
  getCachedProductById,
  prefetchPriceMatchesForProduct,
  prefetchProductById,
  prefetchProductsById,
  seedProductCache,
} from '../services/api';
import { buildProductImageSource } from '../services/productImages';

const IMAGE_BLURHASH = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

function PriceMatchLoader() {
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + (pulse.value * 0.4),
  }));

  return (
    <Animated.View style={[styles.priceMatchLoaderBox, glowStyle]}>
      {[0, 1, 2].map(index => (
        <View key={index} style={[styles.priceMatchSkeletonRow, index === 0 && styles.priceMatchSkeletonRowFeatured]}>
          <View style={styles.priceMatchSkeletonInfo}>
            <View style={[styles.priceMatchSkeletonLine, styles.priceMatchSkeletonRetailer]} />
            <View style={[styles.priceMatchSkeletonLine, styles.priceMatchSkeletonTitle]} />
            <View style={[styles.priceMatchSkeletonLine, styles.priceMatchSkeletonShipping]} />
          </View>
          <View style={styles.priceMatchSkeletonPriceWrap}>
            <View style={[styles.priceMatchSkeletonLine, styles.priceMatchSkeletonPrice]} />
            <View style={[styles.priceMatchSkeletonLine, styles.priceMatchSkeletonIcon]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

function toTitleCase(value?: string) {
  if (!value) {
    return '';
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { addRecentView } = useActivity();
  const { isFavorite: checkFavorite, toggleFavorite } = useFavorites();
  const params = useLocalSearchParams<{
    id?: string;
    originalId?: string;
    dupeProductId?: string;
    similarity?: string;
    matchReason?: string;
    savings?: string;
    fromFeatured?: string;
  }>();

  const {
    fromFeatured,
    id,
    originalId,
    dupeProductId,
    similarity: similarityParam,
    matchReason: matchReasonParam,
    savings: savingsParam,
  } = params;
  const isComparisonView = Boolean((fromFeatured && id) || (originalId && dupeProductId));
  const cachedOriginal = getCachedProductById(originalId || id || '');
  const cachedDupe = getCachedProductById(dupeProductId || '');
  const initialCachedPriceOffers = getCachedPriceMatchesForProduct(cachedOriginal);

  const [original, setOriginal] = useState<Product | null>(cachedOriginal);
  const [dupeProduct, setDupeProduct] = useState<Product | null>(cachedDupe);
  const [similarity, setSimilarity] = useState(0);
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [matchReason, setMatchReason] = useState('');
  const [loading, setLoading] = useState(!(cachedOriginal || cachedDupe));
  const [previewImage, setPreviewImage] = useState('');
  const [priceOffers, setPriceOffers] = useState<PriceOffer[]>(initialCachedPriceOffers || []);
  const [priceOffersLoading, setPriceOffersLoading] = useState(false);
  const [priceOffersError, setPriceOffersError] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const cachedPriceOffers = getCachedPriceMatchesForProduct(original);
  const originalImageSource = buildProductImageSource(original?.image, 720);
  const dupeImageSource = buildProductImageSource(dupeProduct?.image, 720);
  const previewImageSource = buildProductImageSource(previewImage, 1080);

  const loadData = useCallback(async () => {
    const hasCachedContent = Boolean(cachedOriginal || cachedDupe);
    if (hasCachedContent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      if (fromFeatured && id) {
        const featuredDupes = await dataService.getFeaturedDupes();
        const featuredMatch = featuredDupes.find(item => item.id === id);

        if (featuredMatch) {
          setOriginal(featuredMatch.original);
          setDupeProduct(featuredMatch.dupe);
          setSimilarity(featuredMatch.similarity);
          setSavingsAmount(featuredMatch.savings);
          setMatchReason(featuredMatch.matchReason || '');
        }
      } else if (originalId && dupeProductId) {
        const [orig, dupe] = await Promise.all([
          dataService.getProductById(originalId),
          dataService.getProductById(dupeProductId),
        ]);
        setOriginal(orig);
        setDupeProduct(dupe);
        if (orig) {
          addRecentView(orig);
        }
        if (dupe) {
          addRecentView(dupe);
        }
        setSimilarity(Number(similarityParam) || 0);
        setSavingsAmount(Number(savingsParam) || 0);
        setMatchReason(matchReasonParam || '');
      } else if (id) {
        const product = await dataService.getProductById(id);
        if (product) {
          setOriginal(product);
          addRecentView(product);
          setDupeProduct(null);
          setSimilarity(0);
          setSavingsAmount(0);
          setMatchReason('');
        }
      }
    } catch {
      // Error loading products
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addRecentView, cachedDupe, cachedOriginal, dupeProductId, fromFeatured, id, matchReasonParam, originalId, savingsParam, similarityParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let active = true;

    const loadPriceMatches = async () => {
      if (isComparisonView || !original?.name) {
        setPriceOffers([]);
        setPriceOffersLoading(false);
        setPriceOffersError('');
        return;
      }

      setPriceOffersLoading(true);
      setPriceOffersError('');
      try {
        const offers = await dataService.findPriceMatches(original);
        if (active) {
          setPriceOffers(offers);
        }
      } catch {
        if (active) {
          setPriceOffers([]);
          setPriceOffersError('Price matching is not available right now.');
        }
      } finally {
        if (active) {
          setPriceOffersLoading(false);
        }
      }
    };

    loadPriceMatches();

    return () => {
      active = false;
    };
  }, [isComparisonView, original]);

  useEffect(() => {
    if (cachedOriginal) {
      setOriginal(prev => prev || cachedOriginal);
      prefetchProductById(cachedOriginal.id);
    }
    if (cachedDupe) {
      setDupeProduct(prev => prev || cachedDupe);
      prefetchProductById(cachedDupe.id);
    }
  }, [cachedDupe, cachedOriginal]);

  useEffect(() => {
    if (!original?.variantOptions?.length) {
      setSelectedVariantId('');
      return;
    }

    const matchingVariant = original.variantOptions.find(variant => variant.id === original.id);
    setSelectedVariantId(matchingVariant?.id || original.variantOptions[0]?.id || '');
  }, [original]);

  useEffect(() => {
    const variantIds = (original?.variantOptions || [])
      .map(variant => variant.id)
      .filter(variantId => Boolean(variantId) && variantId !== original?.id);

    if (variantIds.length) {
      prefetchProductsById(variantIds);
    }
  }, [original]);

  useEffect(() => {
    if (cachedPriceOffers?.length) {
      setPriceOffers(cachedPriceOffers);
    }
  }, [cachedPriceOffers]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading...</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: spacing.lg }}>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (!original) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: spacing.lg }}>:(</Text>
          <Text style={styles.notFound}>Product not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const favoriteId = original?.variantGroupId || original?.id || id || '';
  const isFav = checkFavorite(favoriteId);
  const displayName = original.familyName || original.name;
  const selectedVariant = original.variantOptions?.find(variant => variant.id === selectedVariantId) || null;
  const displayImage = original.image || selectedVariant?.image || '';
  const displayVariantLabel = original.selectedVariantLabel || selectedVariant?.label || '';
  const displayPrice = original.price > 0 ? original.price : (selectedVariant?.price || 0);

  const handleToggleFavorite = () => {
    if (!original || isComparisonView) return;
    toggleFavorite({
      id: original.variantGroupId || original.id,
      originalId: original.id,
      variantGroupId: original.variantGroupId,
      originalName: displayName,
      originalBrand: original.brand,
      originalPrice: displayPrice,
      originalImage: displayImage,
      savings: 0,
    });
  };

  const handleVariantSelect = async (variantId: string) => {
    if (!variantId || !original || isComparisonView) {
      return;
    }
    if (variantId === original.id) {
      setSelectedVariantId(variantId);
      return;
    }

    setSelectedVariantId(variantId);
    const cachedVariant = getCachedProductById(variantId);
    if (cachedVariant) {
      setOriginal(cachedVariant);
      addRecentView(cachedVariant);
      prefetchPriceMatchesForProduct(cachedVariant);
      return;
    }

    setRefreshing(true);
    try {
      const variantProduct = await dataService.getProductById(variantId);
      if (variantProduct) {
        seedProductCache(variantProduct);
        setOriginal(variantProduct);
        addRecentView(variantProduct);
        prefetchPriceMatchesForProduct(variantProduct);
        return;
      }
      setSelectedVariantId(original.id);
    } catch {
      setSelectedVariantId(original.id);
    } finally {
      setRefreshing(false);
    }
  };

  const openProductPage = (product: Product | null) => {
    if (!product?.id) return;
    seedProductCache(product);
    prefetchProductById(product.id);
    prefetchPriceMatchesForProduct(product);

    router.push({
      pathname: '/productDetails',
      params: {
        id: product.id,
        productName: product.name,
      },
    });
  };

  const openImagePreview = (image?: string) => {
    if (image) {
      setPreviewImage(image);
    }
  };

  const openOffer = (offer: PriceOffer) => {
    if (offer.url) {
      Linking.openURL(offer.url);
    }
  };

  const actualSavings = isComparisonView && dupeProduct
    ? Math.max(original.price - dupeProduct.price, 0)
    : Math.max(savingsAmount, 0);
  const savingsPercent = original.price > 0
    ? Math.round((actualSavings / original.price) * 100)
    : 0;
  const matchReasonParts = getMatchReasonLabels(matchReason);
  const primaryProductFacts = [
    { label: 'Brand', value: original.brand },
    { label: 'Ingredients', value: original.mainIngredient },
    { label: 'Skin Type', value: original.skinType },
    { label: 'Packaging', value: original.packagingType },
    { label: 'Size', value: original.productSize },
    { label: 'Release Year', value: original.releaseYear ? String(original.releaseYear) : '' },
    { label: 'Country', value: original.countryOfOrigin },
    { label: 'Cruelty Free', value: toTitleCase(original.crueltyFree) },
    { label: 'Reviews', value: original.numberOfReviews ? String(original.numberOfReviews) : '' },
    { label: 'Source', value: original.source ? toTitleCase(original.source) : '' },
  ].filter(item => item.value);
  const fallbackProductFacts = [
    { label: 'Category', value: toTitleCase(original.category) },
    { label: 'Product Type', value: toTitleCase(original.productType) },
    { label: 'Gender Target', value: toTitleCase(original.genderTarget) },
  ].filter(item => item.value);
  const productFacts = [
    ...primaryProductFacts,
    ...(primaryProductFacts.length < 4 ? fallbackProductFacts : []),
  ].filter(item => item.value);
  const displayRating = isComparisonView ? (dupeProduct?.rating || original.rating) : original.rating;
  const hasRating = displayRating > 0;
  const confidenceBand = getConfidenceBand(similarity);
  const confidenceSummary = getConfidenceSummary(similarity);
  const comparisonStats = isComparisonView && dupeProduct
    ? buildComparisonStats(original, dupeProduct)
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
        {isComparisonView ? (
          <View style={styles.headerBtnSpacer} />
        ) : (
          <TouchableOpacity onPress={handleToggleFavorite} style={styles.headerBtn}>
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={24}
              color={isFav ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {refreshing ? (
        <View style={styles.refreshPill}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.refreshPillText}>Refreshing product...</Text>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        {isComparisonView ? (
          <Animated.View entering={FadeInDown.duration(500)}>
            <View style={styles.matchBanner}>
              <View style={styles.matchPill}>
                <Feather name="check-circle" size={15} color={colors.primary} />
                <Text style={styles.matchPillText}>Dupe Match</Text>
              </View>
              <View style={styles.matchScoreRow}>
                <Text style={styles.matchNumber}>{similarity}</Text>
                <Text style={styles.matchPercent}>%</Text>
              </View>
              <Text style={styles.matchLabel}>Match Score</Text>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.duration(500)} style={styles.productHero}>
            {displayImage ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => openImagePreview(displayImage)}>
                <Image
                  source={{ uri: displayImage }}
                  style={styles.heroImage}
                  contentFit="cover"
                  placeholder={{ blurhash: IMAGE_BLURHASH }}
                  transition={220}
                />
              </TouchableOpacity>
            ) : (
              <View style={[styles.heroImage, styles.imagePlaceholder]}>
                <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
              </View>
            )}
            <Text style={styles.heroBrand}>{original.brand}</Text>
            <Text style={styles.heroName}>{displayName}</Text>
            {displayVariantLabel ? (
              <View style={styles.variantSummaryPill}>
                <Text style={styles.variantSummaryText}>Color: {displayVariantLabel}</Text>
              </View>
            ) : null}
            <Text style={styles.heroPrice}>${displayPrice.toFixed(2)}</Text>
          </Animated.View>
        )}

        {!isComparisonView && (original.variantOptions?.length || 0) > 1 && (
          <Animated.View entering={FadeInDown.delay(125).duration(400)}>
            <Text style={styles.sectionTitle}>Color Options</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.variantOptionsRow}
            >
              {original.variantOptions?.map(variant => {
                const active = variant.id === selectedVariantId;
                return (
                  <TouchableOpacity
                    key={variant.id}
                    activeOpacity={0.86}
                    onPress={() => { void handleVariantSelect(variant.id); }}
                    style={[styles.variantChip, active && styles.variantChipActive]}
                  >
                    <Text style={[styles.variantChipText, active && styles.variantChipTextActive]}>
                      {variant.label || 'Standard'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

        {isComparisonView && actualSavings > 0 && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <View style={styles.savingsRow}>
              <View style={styles.savingsBadge}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <View>
                  <Text style={styles.savingsAmountText}>Save ${actualSavings.toFixed(2)}</Text>
                  <Text style={styles.savingsPercent}>{savingsPercent}% less</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {isComparisonView && dupeProduct && (
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <Text style={styles.sectionTitle}>Match Breakdown</Text>
            <View style={styles.insightBox}>
              <View style={styles.insightTopRow}>
                <View style={styles.insightMetricCard}>
                  <Text style={styles.insightMetricNumber}>{similarity}%</Text>
                  <Text style={styles.insightMetricLabel}>Match Score</Text>
                </View>
                <View style={styles.insightMetricCard}>
                  <Text style={styles.insightMetricNumber}>{confidenceBand}</Text>
                  <Text style={styles.insightMetricLabel}>Confidence</Text>
                </View>
              </View>
              <Text style={styles.insightSummary}>{confidenceSummary}</Text>
              {matchReasonParts.length > 0 ? (
                <View style={styles.reasonChipGrid}>
                  {matchReasonParts.map(reason => (
                    <View key={reason} style={styles.reasonChip}>
                      <Text style={styles.reasonChipText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Animated.View>
        )}

        {!isComparisonView && (
          <Animated.View entering={FadeInDown.delay(175).duration(400)}>
            <Text style={styles.sectionTitle}>Price Match Results</Text>
            <View style={styles.priceMatchBox}>
              <View style={styles.priceMatchHeader}>
                <View>
                  <Text style={styles.priceMatchEyebrow}>Top 3 live retailer offers</Text>
                  <Text style={styles.priceMatchTitle}>
                    {priceOffers[0]
                      ? `$${priceOffers[0].price.toFixed(2)} at ${priceOffers[0].retailer}`
                      : priceOffersLoading
                        ? 'Scanning live retailers'
                        : 'No live offers found'}
                  </Text>
                </View>
                {priceOffersLoading ? (
                  <View style={styles.priceMatchStatusPill}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.priceMatchStatus}>
                      {priceOffers.length > 0 ? 'Refreshing live offers' : 'Scanning retailers'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {priceOffersError ? <Text style={styles.priceMatchError}>{priceOffersError}</Text> : null}

              {priceOffersLoading && priceOffers.length === 0 ? (
                <PriceMatchLoader />
              ) : null}

              {!priceOffersLoading && !priceOffersError && priceOffers.length === 0 ? (
                <Text style={styles.priceMatchEmpty}>No live shopping links found right now.</Text>
              ) : null}

              {priceOffers.slice(0, 3).map((offer, index) => (
                <TouchableOpacity
                  key={offer.id}
                  activeOpacity={0.86}
                  style={[styles.offerRow, index === 0 && styles.bestOfferRow]}
                  onPress={() => openOffer(offer)}
                >
                  <View style={styles.offerInfo}>
                    <View style={styles.offerMetaRow}>
                      <Text style={styles.offerRetailer}>{offer.retailer}</Text>
                      {index === 0 ? <Text style={styles.bestOfferPill}>Best price</Text> : null}
                    </View>
                    <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                    {offer.shipping ? <Text style={styles.offerShipping} numberOfLines={1}>{offer.shipping}</Text> : null}
                  </View>
                  <View style={styles.offerAction}>
                    <Text style={styles.offerPrice}>${offer.price.toFixed(2)}</Text>
                    <Feather name="external-link" size={16} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {isComparisonView && (
          <Animated.View entering={FadeInDown.delay(225).duration(400)}>
            <Text style={styles.sectionTitle}>Product Comparison</Text>
            <View style={styles.comparisonRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.productCard}
                onPress={() => openProductPage(original)}
              >
                <TouchableOpacity activeOpacity={0.9} onPress={() => openImagePreview(original.image)}>
                  {original.image ? (
                    <Image
                      source={originalImageSource!}
                      style={styles.productImage}
                      contentFit="contain"
                      placeholder={{ blurhash: IMAGE_BLURHASH }}
                      transition={220}
                    />
                  ) : (
                    <View style={[styles.productImage, styles.imagePlaceholder]}>
                      <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={[styles.labelBadge, styles.originalBadge]}>
                  <Text style={[styles.labelText, styles.originalBadgeText]}>ORIGINAL</Text>
                </View>
                <Text style={styles.productBrand}>{original.brand}</Text>
                <Text style={styles.productName} numberOfLines={2}>{original.familyName || original.name}</Text>
                <Text style={[styles.productPrice, { color: colors.primary }]}>${original.price.toFixed(2)}</Text>
                <Text style={styles.productLinkHint}>Tap to open product page</Text>
              </TouchableOpacity>

              <View style={styles.vsCircle}>
                <Text style={styles.vsText}>VS</Text>
              </View>

              {dupeProduct && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.productCard}
                  onPress={() => openProductPage(dupeProduct)}
                >
                  <TouchableOpacity activeOpacity={0.9} onPress={() => openImagePreview(dupeProduct.image)}>
                    {dupeProduct.image ? (
                      <Image
                        source={dupeImageSource!}
                        style={styles.productImage}
                        contentFit="contain"
                        placeholder={{ blurhash: IMAGE_BLURHASH }}
                        transition={220}
                      />
                    ) : (
                      <View style={[styles.productImage, styles.imagePlaceholder]}>
                        <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={[styles.labelBadge, styles.dupeBadge]}>
                    <Text style={[styles.labelText, styles.dupeBadgeText]}>DUPE</Text>
                  </View>
                  <Text style={styles.productBrand}>{dupeProduct.brand}</Text>
                  <Text style={styles.productName} numberOfLines={2}>{dupeProduct.familyName || dupeProduct.name}</Text>
                  <Text style={[styles.productPrice, { color: colors.success }]}>${dupeProduct.price.toFixed(2)}</Text>
                  <Text style={styles.productLinkHint}>Tap to open product page</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {!isComparisonView && original.colors && original.colors.length > 0 && !(original.variantOptions?.length > 1) && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <Text style={styles.sectionTitle}>Available Shades</Text>
            <View style={styles.shadesRow}>
              {original.colors.map((c, i) => (
                <View key={i} style={[styles.shade, { backgroundColor: c.hex }]} />
              ))}
            </View>
          </Animated.View>
        )}

        {isComparisonView && dupeProduct?.colors && dupeProduct.colors.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <Text style={styles.sectionTitle}>Available Shades</Text>
            <View style={styles.shadesRow}>
              {dupeProduct.colors.map((c, i) => (
                <View key={i} style={[styles.shade, { backgroundColor: c.hex }]} />
              ))}
            </View>
          </Animated.View>
        )}

        {hasRating && (
          <Animated.View entering={FadeInDown.delay(350).duration(400)}>
            <Text style={styles.sectionTitle}>Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <Ionicons
                  key={star}
                  name={star <= Math.round(displayRating) ? 'star' : 'star-outline'}
                  size={22}
                  color={colors.accentDark}
                />
              ))}
              <Text style={styles.ratingValue}>{displayRating.toFixed(1)}</Text>
            </View>
          </Animated.View>
        )}

        {isComparisonView && comparisonStats.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(260).duration(400)}>
            <Text style={styles.sectionTitle}>Compare The Details</Text>
            <View style={styles.compareTable}>
              {comparisonStats.map(stat => (
                <View key={stat.label} style={styles.compareRow}>
                  <View style={styles.compareValueBlock}>
                    <Text style={[styles.compareValue, stat.winner === 'original' && styles.compareValueMuted]}>
                      {stat.originalValue}
                    </Text>
                    <Text style={styles.compareSideLabel}>Original</Text>
                  </View>
                  <View style={styles.compareCenterBlock}>
                    <Text style={styles.compareLabel}>{stat.label}</Text>
                    <Text style={styles.compareWinner}>
                      {stat.winner === 'dupe' ? 'Dupe wins' : stat.winner === 'original' ? 'Original wins' : 'Even'}
                    </Text>
                  </View>
                  <View style={styles.compareValueBlock}>
                    <Text style={[styles.compareValue, stat.winner === 'dupe' && styles.compareValueAccent]}>
                      {stat.dupeValue}
                    </Text>
                    <Text style={styles.compareSideLabel}>Dupe</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {productFacts.length > 0 && (
          <Animated.View entering={FadeInDown.delay(375).duration(400)}>
            <Text style={styles.sectionTitle}>Product Info</Text>
            <View style={styles.factsBox}>
              {productFacts.map(item => (
                <View key={item.label} style={styles.factRow}>
                  <Text style={styles.factLabel}>{item.label}</Text>
                  <Text style={styles.factValue}>{item.value}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        <View style={{ height: spacing.xxxl + spacing.xl }} />
      </ScrollView>

      <Modal
        visible={Boolean(previewImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage('')}
      >
        <View style={styles.previewBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.previewCloseLayer}
            onPress={() => setPreviewImage('')}
          />
          <View style={styles.previewFrame}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close image preview"
              onPress={() => setPreviewImage('')}
              style={styles.previewCloseButton}
            >
              <Ionicons name="close" size={24} color={colors.textOnPrimary} />
            </TouchableOpacity>
            {previewImage ? (
              <Image
                source={previewImageSource!}
                style={styles.previewImage}
                contentFit="contain"
                placeholder={{ blurhash: IMAGE_BLURHASH }}
                transition={180}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  goBackBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  goBackText: {
    color: colors.textOnPrimary,
    ...typography.captionBold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  headerBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  headerBtnSpacer: {
    width: 40,
  },
  headerTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  refreshPill: {
    alignSelf: 'center',
    marginTop: spacing.sm,
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
  refreshPillText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  productHero: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  heroImage: {
    width: 230,
    height: 230,
    borderRadius: 36,
    backgroundColor: colors.skeleton,
    ...shadows.md,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  imagePlaceholderText: {
    ...typography.smallBold,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  heroBrand: {
    ...typography.small,
    color: colors.primary,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  heroName: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  heroPrice: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  variantSummaryPill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.cream,
  },
  variantSummaryText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  variantOptionsRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  variantChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  variantChipActive: {
    backgroundColor: colors.primary,
  },
  variantChipText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  variantChipTextActive: {
    color: colors.textOnPrimary,
  },
  matchBanner: {
    backgroundColor: colors.accentLight,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    ...shadows.md,
  },
  matchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  matchPillText: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  matchScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  matchNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0,
    lineHeight: 68,
  },
  matchPercent: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.sm,
    marginLeft: 2,
  },
  matchLabel: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 2,
  },
  savingsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  savingsAmountText: {
    ...typography.captionBold,
    color: colors.success,
  },
  savingsPercent: {
    ...typography.small,
    color: colors.textSecondary,
  },
  priceMatchBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
    gap: spacing.md,
  },
  priceMatchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  priceMatchEyebrow: {
    ...typography.smallBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  priceMatchTitle: {
    ...typography.h3,
    color: colors.primary,
    marginTop: 2,
  },
  priceMatchStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  priceMatchStatus: {
    ...typography.smallBold,
    color: colors.primary,
  },
  priceMatchError: {
    ...typography.smallBold,
    color: colors.error,
  },
  priceMatchLoaderBox: {
    gap: spacing.sm,
  },
  priceMatchSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  priceMatchSkeletonRowFeatured: {
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  priceMatchSkeletonInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  priceMatchSkeletonLine: {
    borderRadius: radius.full,
    backgroundColor: colors.skeleton,
  },
  priceMatchSkeletonRetailer: {
    width: '38%',
    height: 12,
  },
  priceMatchSkeletonTitle: {
    width: '88%',
    height: 14,
  },
  priceMatchSkeletonShipping: {
    width: '52%',
    height: 12,
  },
  priceMatchSkeletonPriceWrap: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  priceMatchSkeletonPrice: {
    width: 58,
    height: 16,
  },
  priceMatchSkeletonIcon: {
    width: 18,
    height: 18,
  },
  priceMatchEmpty: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.cream,
  },
  bestOfferRow: {
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  offerInfo: {
    flex: 1,
  },
  offerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  offerRetailer: {
    ...typography.captionBold,
    color: colors.primary,
  },
  bestOfferPill: {
    ...typography.smallBold,
    color: colors.textOnPrimary,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  offerTitle: {
    ...typography.small,
    color: colors.text,
    marginTop: 3,
    lineHeight: 18,
  },
  offerShipping: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 3,
  },
  offerAction: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  offerPrice: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  insightBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  insightTopRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  insightMetricCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  insightMetricNumber: {
    ...typography.bodyBold,
    color: colors.primary,
    textAlign: 'center',
  },
  insightMetricLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  insightSummary: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
  reasonChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reasonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonChipText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  compareTable: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
    gap: spacing.md,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compareValueBlock: {
    flex: 1,
  },
  compareCenterBlock: {
    width: 94,
    alignItems: 'center',
  },
  compareLabel: {
    ...typography.smallBold,
    color: colors.primary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  compareWinner: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  compareValue: {
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
  },
  compareValueAccent: {
    color: colors.success,
  },
  compareValueMuted: {
    color: colors.primary,
  },
  compareSideLabel: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  productCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  productImage: {
    width: '100%',
    height: 130,
    borderRadius: radius.md,
    backgroundColor: colors.skeleton,
  },
  labelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  originalBadge: {
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.borderAccent,
  },
  originalBadgeText: {
    color: colors.primary,
  },
  dupeBadge: {
    backgroundColor: colors.accentLight,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  dupeBadgeText: {
    color: colors.accentDark,
  },
  productBrand: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  productName: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 2,
    minHeight: 36,
  },
  productPrice: {
    ...typography.bodyBold,
    marginTop: spacing.xs,
  },
  productLinkHint: {
    ...typography.small,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  vsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -4,
    zIndex: 1,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  vsText: {
    ...typography.smallBold,
    color: colors.textOnPrimary,
  },
  shadesRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  shade: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  ratingValue: {
    ...typography.h3,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  factsBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
    gap: spacing.md,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  factLabel: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
  },
  factValue: {
    ...typography.captionBold,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 16, 21, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  previewCloseLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  previewFrame: {
    width: '100%',
    maxWidth: 720,
    height: '78%',
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.pink,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewCloseButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
