import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import { useActivity } from '../hooks/useActivity';
import { useFavorites } from '../hooks/useFavorites';
import type { Product } from '../services/api';
import { dataService } from '../services/api';

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { addRecentView } = useActivity();
  const { isFavorite: checkFavorite, toggleFavorite } = useFavorites();
  const params = useLocalSearchParams<{
    id?: string;
    dupeId?: string;
    originalId?: string;
    dupeProductId?: string;
    similarity?: string;
    matchReason?: string;
    savings?: string;
    fromFeatured?: string;
  }>();

  const [original, setOriginal] = useState<Product | null>(null);
  const [dupeProduct, setDupeProduct] = useState<Product | null>(null);
  const [similarity, setSimilarity] = useState(0);
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [matchReason, setMatchReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState('');
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

  const loadData = useCallback(async () => {
    setLoading(true);
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
    }
  }, [addRecentView, dupeProductId, fromFeatured, id, matchReasonParam, originalId, savingsParam, similarityParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          <Text style={{ fontSize: 48, marginBottom: spacing.lg }}>😕</Text>
          <Text style={styles.notFound}>Product not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const favoriteId = params.dupeId || id || '';
  const isFav = checkFavorite(favoriteId);

  const handleToggleFavorite = () => {
    if (!original) return;
    toggleFavorite({
      id: favoriteId,
      kind: isComparisonView ? 'comparison' : 'product',
      originalId: original.id,
      dupeProductId: dupeProduct?.id,
      originalName: original.name,
      originalBrand: original.brand,
      originalPrice: original.price,
      originalImage: original.image,
      dupeName: dupeProduct?.name || original.name,
      dupeBrand: dupeProduct?.brand || original.brand,
      dupePrice: dupeProduct?.price || original.price,
      dupeImage: dupeProduct?.image || original.image,
      similarity,
      matchReason,
      savings: savingsAmount,
    });
  };

  const openProductPage = (product: Product | null) => {
    if (!product?.id) return;

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

  const savingsPercent = original.price > 0
    ? Math.round((savingsAmount / original.price) * 100)
    : 0;
  const matchReasonParts = matchReason
    ? matchReason.split(',').map(part => part.trim()).filter(Boolean)
    : [];
  const productFacts = [
    { label: 'Category', value: original.category },
    { label: 'Product Type', value: original.productType },
    { label: 'Ingredients', value: original.mainIngredient },
    { label: 'Skin Type', value: original.skinType },
    { label: 'Packaging', value: original.packagingType },
    { label: 'Size', value: original.productSize },
    { label: 'Country', value: original.countryOfOrigin },
    { label: 'Gender Target', value: original.genderTarget },
    { label: 'Cruelty Free', value: original.crueltyFree },
    { label: 'Reviews', value: original.numberOfReviews ? String(original.numberOfReviews) : '' },
  ].filter(item => item.value);
  const displayRating = isComparisonView ? (dupeProduct?.rating || original.rating) : original.rating;
  const hasRating = displayRating > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{original.name}</Text>
        <TouchableOpacity onPress={handleToggleFavorite} style={styles.headerBtn}>
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={24}
            color={isFav ? colors.accent : colors.textMuted}
          />
        </TouchableOpacity>
      </View>

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
            {original.image ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => openImagePreview(original.image)}>
                <Image source={{ uri: original.image }} style={styles.heroImage} contentFit="cover" />
              </TouchableOpacity>
            ) : (
              <View style={[styles.heroImage, styles.imagePlaceholder]}>
                <Text style={styles.imagePlaceholderText}>Image unavailable</Text>
              </View>
            )}
            <Text style={styles.heroBrand}>{original.brand}</Text>
            <Text style={styles.heroName}>{original.name}</Text>
            <Text style={styles.heroPrice}>${original.price.toFixed(2)}</Text>
          </Animated.View>
        )}

        {isComparisonView && savingsAmount > 0 && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <View style={styles.savingsRow}>
              <View style={styles.savingsBadge}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <View>
                  <Text style={styles.savingsAmountText}>Save ${savingsAmount.toFixed(2)}</Text>
                  <Text style={styles.savingsPercent}>{savingsPercent}% less</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {isComparisonView && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <Text style={styles.sectionTitle}>Product Comparison</Text>
            <View style={styles.comparisonRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.productCard}
                onPress={() => openProductPage(original)}
              >
                <TouchableOpacity activeOpacity={0.9} onPress={() => openImagePreview(original.image)}>
                  {original.image ? (
                    <Image source={{ uri: original.image }} style={styles.productImage} contentFit="cover" />
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
                <Text style={styles.productName} numberOfLines={2}>{original.name}</Text>
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
                      <Image source={{ uri: dupeProduct.image }} style={styles.productImage} contentFit="cover" />
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
                  <Text style={styles.productName} numberOfLines={2}>{dupeProduct.name}</Text>
                  <Text style={[styles.productPrice, { color: colors.success }]}>${dupeProduct.price.toFixed(2)}</Text>
                  <Text style={styles.productLinkHint}>Tap to open product page</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {!isComparisonView && original.colors && original.colors.length > 0 && (
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

        {isComparisonView && (
          <Animated.View entering={FadeInUp.delay(400).duration(400)}>
            <Text style={styles.sectionTitle}>Why This Match?</Text>
            <View style={styles.reasonsBox}>
              {(matchReasonParts.length > 0 ? matchReasonParts : ['Matched on closest overall product attributes']).map((reason, i) => (
                <View key={i} style={styles.reasonRow}>
                  <View style={styles.checkCircle}>
                    <Feather name="check" size={14} color={colors.success} />
                  </View>
                  <Text style={styles.reasonText}>{reason}</Text>
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
              <Image source={{ uri: previewImage }} style={styles.previewImage} contentFit="contain" />
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
  headerTitle: {
    ...typography.bodyBold,
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
  reasonsBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
    gap: spacing.md,
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
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
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
