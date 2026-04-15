import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowDown, ArrowLeft, Search, Star } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import { useProductsByCategory } from '../hooks/useProducts';

type SortOption = 'az' | 'priceLow' | 'priceHigh' | 'popular';

const sortOptions: { id: SortOption; label: string }[] = [
  { id: 'az', label: 'A-Z' },
  { id: 'priceLow', label: '$ Low' },
  { id: 'priceHigh', label: '$ High' },
  { id: 'popular', label: 'Popular' },
];

const pageSizeOptions = [12, 24, 48, 96];

export default function CategoryProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const category = params.category || '';
  const title = params.title || 'Category';
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const { data, loading, error } = useProductsByCategory(category, { page, pageSize, query, sort: sortBy });
  const products = data?.items || [];
  const totalProducts = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  useEffect(() => {
    setPage(1);
  }, [category, query, sortBy, pageSize]);

  useEffect(() => {
    if (data?.totalPages && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data?.totalPages, page]);

  const openProduct = (id: string, name: string) => {
    router.push({
      pathname: '/productDetails',
      params: { id, productName: name },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft width={24} height={24} stroke={colors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{title}</Text>
          {!loading && !error ? (
            <Text style={styles.subtitle}>
              {totalProducts} products • page {Math.min(page, totalPages)} of {totalPages}
            </Text>
          ) : null}
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

      <View style={styles.pageSizeBlock}>
        <Text style={styles.pageSizeLabel}>Results per page</Text>
        <View style={styles.pageSizeOptions}>
          {pageSizeOptions.map(size => {
            const active = pageSize === size;
            return (
              <Pressable
                key={size}
                onPress={() => setPageSize(size)}
                style={({ pressed }) => [
                  styles.pageSizeChip,
                  active && styles.pageSizeChipActive,
                  pressed && styles.sortChipPressed,
                ]}
              >
                <Text style={[styles.pageSizeChipText, active && styles.pageSizeChipTextActive]}>{size}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
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
        <>
          <FlatList
            data={products}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => openProduct(item.id, item.name)}
              >
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.image} contentFit="cover" />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    <Text style={styles.placeholderText}>Image unavailable</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.brand}>{item.brand}</Text>
                  <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.type}>{item.productType}</Text>
                    <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                  </View>
                </View>
              </Pressable>
            )}
            ListFooterComponent={
              <View style={styles.pagination}>
                <Pressable
                  disabled={page <= 1}
                  onPress={() => setPage(prev => Math.max(1, prev - 1))}
                  style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
                >
                  <Text style={[styles.pageButtonText, page <= 1 && styles.pageButtonTextDisabled]}>Previous</Text>
                </Pressable>
                <Text style={styles.pageCount}>Page {page} of {totalPages}</Text>
                <Pressable
                  disabled={page >= totalPages}
                  onPress={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  style={[styles.pageButton, page >= totalPages && styles.pageButtonDisabled]}
                >
                  <Text style={[styles.pageButtonText, page >= totalPages && styles.pageButtonTextDisabled]}>Next</Text>
                </Pressable>
              </View>
            }
          />
        </>
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
  },
  subtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
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
  pageSizeBlock: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  pageSizeLabel: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  pageSizeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pageSizeChip: {
    minWidth: 52,
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pageSizeChipActive: {
    backgroundColor: colors.primary,
  },
  pageSizeChipText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  pageSizeChipTextActive: {
    color: colors.textOnPrimary,
  },
  loadingWrap: {
    paddingHorizontal: spacing.lg,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
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
