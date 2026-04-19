import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDown, ArrowLeft, Search, Star } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useProductsByCategory } from '../hooks/useProducts';
import type { Product } from '../services/api';
import { prefetchCategoryPage, prefetchProductsById, seedProductCache } from '../services/api';

const EMPTY_PRODUCTS: Product[] = [];
const DEFAULT_PAGE_SIZE = 10;
const IMAGE_BLURHASH = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

type SortOption = 'az' | 'priceLow' | 'priceHigh' | 'popular';
type ViewMode = 'list' | 'grid';

const sortOptions: { id: SortOption; label: string }[] = [
  { id: 'az', label: 'A-Z' },
  { id: 'priceLow', label: '$ Low' },
  { id: 'priceHigh', label: '$ High' },
  { id: 'popular', label: 'Popular' },
];

export default function CategoryProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const category = params.category || '';
  const title = params.title || 'Category';
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query.trim(), 220);
  const pageSize = DEFAULT_PAGE_SIZE;
  const { data, loading, error } = useProductsByCategory(category, { page, pageSize, query: debouncedQuery, sort: sortBy });
  const products = data?.items || EMPTY_PRODUCTS;
  const totalProducts = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const isInitialLoading = loading && products.length === 0;
  const isRefreshingResults = loading && products.length > 0;
  const isPageTransitionLoading = isRefreshingResults && data?.page !== page;

  useEffect(() => {
    setPage(1);
  }, [category, debouncedQuery, sortBy]);

  useEffect(() => {
    if (data?.totalPages && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data?.totalPages, page]);

  useEffect(() => {
    products.slice(0, 8).forEach(seedProductCache);
    prefetchProductsById(products.slice(0, 8).map(product => product.id));
  }, [products]);

  useEffect(() => {
    if (!category || !data || page >= totalPages) {
      return;
    }

    prefetchCategoryPage(category, {
      page: page + 1,
      pageSize,
      query: debouncedQuery,
      sort: sortBy,
    });
  }, [category, data, debouncedQuery, page, pageSize, sortBy, totalPages]);

  const openProduct = (id: string, name: string) => {
    const selected = products.find(item => item.id === id);
    if (selected) {
      seedProductCache(selected);
    }
    router.push({
      pathname: '/productDetails',
      params: { id, productName: name },
    });
  };

  const subtitle = loading && products.length > 0
    ? `Updating page ${page}...`
    : `${totalProducts} products • page ${Math.min(page, totalPages)} of ${totalPages}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft width={24} height={24} stroke={colors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <Search width={18} height={18} stroke={colors.accent} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${title.toLowerCase()} products...`}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryEyebrow}>{debouncedQuery ? 'Filtered Browse' : 'Category Browse'}</Text>
        <Text style={styles.summaryTitle}>
          {debouncedQuery ? `Results for "${debouncedQuery}"` : `Best of ${title}`}
        </Text>
        <Text style={styles.summaryBody}>
          {debouncedQuery
            ? 'Typing is lightly delayed before we refresh the list, so browsing stays smooth.'
            : 'Popular product families load first, and the next page is prefetched in the background.'}
        </Text>
      </View>

      <View style={styles.sortBlock}>
        <View style={styles.sortLabelRow}>
          <ArrowDown width={16} height={16} stroke={colors.primary} />
          <Text style={styles.sortLabel}>Sort products</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortOptions}
        >
          {sortOptions.map(option => {
            const active = sortBy === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setSortBy(option.id)}
                style={({ pressed }) => [
                  styles.sortChip,
                  active && styles.sortChipActive,
                  pressed && styles.sortChipPressed,
                ]}
              >
                {option.id === 'popular' ? (
                  <Star
                    width={13}
                    height={13}
                    stroke={active ? colors.textOnPrimary : colors.primary}
                    fill={active ? colors.textOnPrimary : 'transparent'}
                  />
                ) : null}
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.viewModeBlock}>
        <Text style={styles.viewModeLabel}>View</Text>
        <View style={styles.viewModeOptions}>
          {(['list', 'grid'] as ViewMode[]).map(mode => {
            const active = viewMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                style={({ pressed }) => [
                  styles.viewModeChip,
                  active && styles.viewModeChipActive,
                  pressed && styles.sortChipPressed,
                ]}
              >
                <Text style={[styles.viewModeChipText, active && styles.viewModeChipTextActive]}>
                  {mode === 'list' ? 'List' : 'Grid'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isInitialLoading ? (
        <View style={styles.loadingWrap}>
          {[1, 2, 3, 4].map(i => (
            <ProductCardSkeleton key={i} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Couldn’t load products</Text>
          <Text style={styles.stateSubtitle}>{error}</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>No products found</Text>
          <Text style={styles.stateSubtitle}>Try a different search inside this category</Text>
        </View>
      ) : (
        <FlatList
          key={`category-products-${viewMode}`}
          data={products}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, viewMode === 'grid' && styles.gridList]}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isRefreshingResults ? (
              <View style={styles.inlineLoadingPill}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.inlineLoadingText}>
                  {isPageTransitionLoading ? `Loading page ${page}...` : 'Refreshing products...'}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                viewMode === 'grid' ? styles.cardGrid : styles.cardList,
                pressed && styles.cardPressed,
              ]}
              onPress={() => openProduct(item.id, item.familyName || item.name)}
            >
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={[styles.image, viewMode === 'grid' && styles.imageGrid]}
                  contentFit="cover"
                  placeholder={{ blurhash: IMAGE_BLURHASH }}
                  transition={220}
                />
              ) : (
                <View style={[styles.image, viewMode === 'grid' && styles.imageGrid, styles.imagePlaceholder]}>
                  <Text style={styles.placeholderText}>Image unavailable</Text>
                </View>
              )}
              <View style={[styles.info, viewMode === 'grid' && styles.infoGrid]}>
                <Text style={styles.brand}>{item.brand}</Text>
                <Text style={styles.name} numberOfLines={2}>{item.familyName || item.name}</Text>
                <View style={[styles.metaRow, viewMode === 'grid' && styles.metaRowGrid]}>
                  <Text style={styles.type}>{item.productType}</Text>
                  <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  disabled={page <= 1 || loading}
                  onPress={() => setPage(prev => Math.max(1, prev - 1))}
                  style={[styles.pageButton, (page <= 1 || loading) && styles.pageButtonDisabled]}
                >
                  <Text style={[styles.pageButtonText, (page <= 1 || loading) && styles.pageButtonTextDisabled]}>
                    {loading ? 'Loading...' : 'Previous'}
                  </Text>
                </Pressable>
                <Text style={styles.pageCount}>Page {page} of {totalPages}</Text>
                <Pressable
                  disabled={page >= totalPages || loading}
                  onPress={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  style={[styles.pageButton, (page >= totalPages || loading) && styles.pageButtonDisabled]}
                >
                  <Text style={[styles.pageButtonText, (page >= totalPages || loading) && styles.pageButtonTextDisabled]}>
                    {loading ? 'Loading...' : 'Next'}
                  </Text>
                </Pressable>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.pink,
    borderBottomWidth: 1,
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
  title: {
    ...typography.h2,
    color: colors.primary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  searchWrap: {
    margin: spacing.lg,
    marginBottom: spacing.md,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 1,
  },
  searchInput: {
    paddingVertical: spacing.lg,
    paddingLeft: 40,
    paddingRight: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    color: colors.text,
    ...typography.body,
    backgroundColor: colors.surface,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  summaryEyebrow: {
    ...typography.smallBold,
    color: colors.accentDark,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  summaryBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  sortBlock: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sortLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sortLabel: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  sortOptions: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  sortChip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  sortChipText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  sortChipTextActive: {
    color: colors.textOnPrimary,
  },
  loadingWrap: {
    paddingHorizontal: spacing.lg,
  },
  viewModeBlock: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  viewModeLabel: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  viewModeOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  viewModeChip: {
    minWidth: 76,
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
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  gridList: {
    paddingBottom: spacing.xxxl,
  },
  gridRow: {
    gap: spacing.md,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  pageButton: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pageButtonDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  pageButtonText: {
    ...typography.captionBold,
    color: colors.textOnPrimary,
  },
  pageButtonTextDisabled: {
    color: colors.textMuted,
  },
  pageCount: {
    ...typography.captionBold,
    color: colors.primary,
    textAlign: 'center',
    flex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
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
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.skeleton,
  },
  imageGrid: {
    width: '100%',
    height: 148,
    marginBottom: spacing.md,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  placeholderText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  infoGrid: {
    marginLeft: 0,
  },
  brand: {
    ...typography.small,
    color: colors.accentDark,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  name: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  metaRowGrid: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  type: {
    ...typography.small,
    color: colors.primary,
    textTransform: 'capitalize',
    flex: 1,
  },
  price: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  stateTitle: {
    ...typography.captionBold,
    color: colors.primary,
    textAlign: 'center',
  },
  stateSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
