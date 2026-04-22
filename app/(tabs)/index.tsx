import { Asset } from 'expo-asset';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Search, TrendingUp } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import ProductCard from '../../components/ProductCard';
import { ProductCardSkeleton } from '../../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useActivity } from '../../hooks/useActivity';
import { useSearch } from '../../hooks/useProducts';
import { prefetchDupesForProduct, seedProductCache } from '../../services/api';

const BRAND_LOGO_URI = Asset.fromModule(require('../../assets/images/duply-logo-background.svg')).uri;
const BRAND_WORDMARK_URI = Asset.fromModule(require('../../assets/images/duply-logo-text.svg')).uri;

export default function HomeScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { results, loading: searchLoading, error: searchError, search } = useSearch();
  const { recentViews, loaded: activityLoaded, addRecentSearch } = useActivity();
  const showingSuggestions = query.trim().length > 1;

  const openProduct = (id: string, name: string) => {
    const selected = results.find(item => item.id === id);
    if (selected) {
      seedProductCache(selected);
      prefetchDupesForProduct(selected);
    }
    addRecentSearch(query.trim());
    router.push({
      pathname: '/searchResults',
      params: { productId: id, productName: name },
    });
    setQuery('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Learn more about duply"
          onPress={() => router.push('/about')}
          style={({ pressed }) => [styles.topSideSlot, pressed && styles.brandLogoPressed]}
        >
          <View style={styles.brandLogoFrame}>
            <SvgUri uri={BRAND_LOGO_URI} width="100%" height="100%" />
          </View>
        </Pressable>
        <View style={styles.brandWordmarkFrame}>
          <SvgUri uri={BRAND_WORDMARK_URI} width="100%" height="100%" />
        </View>
        <View style={[styles.topSideSlot, styles.topSideSlotRight]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.heading}>Find Your{'\n'}Perfect Dupe</Text>
          </View>
          <View>
            <Text style={styles.sub}>
              Discover affordable beauty dupes and live price matches.
            </Text>
          </View>

          <View style={{ width: '100%' }}>
            <View style={styles.searchArea}>
              <View style={styles.searchBar}>
                <Search width={20} height={20} stroke={colors.accent} />
                <TextInput
                  value={query}
                  onChangeText={(text) => {
                    setQuery(text);
                    search(text);
                  }}
                  onSubmitEditing={() => {
                    const trimmed = query.trim();
                    if (trimmed.length > 1) {
                      addRecentSearch(trimmed);
                      router.push({
                        pathname: '/searchCatalog',
                        params: { q: trimmed },
                      });
                    }
                  }}
                  placeholder="Search products..."
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
              </View>

              {showingSuggestions ? (
                <View style={styles.suggestionsPanel}>
                  {searchLoading ? (
                    <View style={styles.suggestionsLoading}>
                      <Text style={styles.suggestionsSubtitle}>Searching...</Text>
                    </View>
                  ) : searchError ? (
                    <View style={styles.suggestionsState}>
                      <Text style={styles.suggestionsTitle}>Search unavailable</Text>
                      <Text style={styles.suggestionsSubtitle}>{searchError}</Text>
                    </View>
                  ) : results.length > 0 ? (
                    <FlatList
                      data={results}
                      keyExtractor={item => item.id}
                      keyboardShouldPersistTaps="handled"
                      style={styles.suggestionsList}
                      contentContainerStyle={styles.suggestionsListContent}
                      ItemSeparatorComponent={() => <View style={styles.suggestionDivider} />}
                      renderItem={({ item }) => (
                        <Pressable
                          style={({ pressed }) => [styles.suggestionItem, pressed && { opacity: 0.7 }]}
                          onPress={() => openProduct(item.id, item.familyName || item.name)}
                        >
                          <View style={styles.suggestionText}>
                            <Text style={styles.suggestionBrand}>{item.brand}</Text>
                            <Text style={styles.suggestionName} numberOfLines={1}>{item.familyName || item.name}</Text>
                          </View>
                        </Pressable>
                      )}
                    />
                  ) : (
                    <View style={styles.suggestionsState}>
                      <Text style={styles.suggestionsTitle}>No products found</Text>
                      <Text style={styles.suggestionsSubtitle}>Try a different brand or product name</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>How Duply Works</Text>
            <Text style={styles.featureBody}>
              Search a product, open the closest match, then compare dupes and live retailer offers without leaving the flow.
            </Text>
            <View style={styles.featureSteps}>
              <View style={styles.featureStepPill}>
                <Text style={styles.featureStepText}>1. Search a brand or product</Text>
              </View>
              <View style={styles.featureStepPill}>
                <Text style={styles.featureStepText}>2. Open the best source product</Text>
              </View>
              <View style={styles.featureStepPill}>
                <Text style={styles.featureStepText}>3. Compare dupes and prices</Text>
              </View>
            </View>
            <Pressable onPress={() => router.push('/categories')} style={styles.featureButton}>
              <Text style={styles.featureButtonText}>Browse Categories</Text>
            </Pressable>
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp width={20} height={20} stroke={colors.primary} />
            <Text style={styles.sectionTitle}>Recently Viewed</Text>
          </View>

          {!activityLoaded ? (
            <FlatList
              horizontal
              data={[1, 2, 3]}
              keyExtractor={i => String(i)}
              renderItem={() => <ProductCardSkeleton />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          ) : recentViews.length > 0 ? (
            <FlatList
              horizontal
              data={recentViews}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <ProductCard
                  name={item.familyName || item.name}
                  brand={item.brand}
                  price={item.price}
                  image={item.image}
                  onPress={() =>
                    router.push({
                      pathname: '/productDetails',
                      params: { id: item.id, productName: item.familyName || item.name },
                    })
                  }
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
            />
          ) : (
            <View style={styles.emptyActivityCard}>
              <Text style={styles.emptyActivityTitle}>No recent views yet</Text>
              <Text style={styles.emptyActivitySubtitle}>
                Search products or browse a category and the ones you open will show up here.
              </Text>
              <Pressable onPress={() => router.push('/categories')} style={styles.emptyActivityButton}>
                <Text style={styles.emptyActivityButtonText}>Browse Categories</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  topSideSlot: {
    width: 68,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topSideSlotRight: {
    alignItems: 'flex-end',
  },
  menuBtn: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  brandLogoFrame: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.cream,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogoImage: {
    width: 40,
    height: 40,
  },
  brandLogoPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  brandWordmarkFrame: {
    flex: 1,
    height: 104,
    marginHorizontal: spacing.xs,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWordmarkImage: {
    width: 540,
    height: 172,
    marginLeft: -10,
    marginTop: -16,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  hero: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    overflow: 'visible',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    borderBottomWidth: 2,
    borderColor: colors.primary,
  },
  heading: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 44,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    maxWidth: 310,
    lineHeight: 24,
  },
  searchArea: {
    width: '100%',
    position: 'relative',
    zIndex: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: 18,
    paddingHorizontal: spacing.xl,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.lg,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  suggestionsPanel: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.primary,
    maxHeight: 320,
    overflow: 'hidden',
    ...shadows.lg,
  },
  suggestionsLoading: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  suggestionsList: {
    maxHeight: 320,
  },
  suggestionsListContent: {
    paddingVertical: spacing.xs,
  },
  suggestionsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  suggestionsTitle: {
    ...typography.captionBold,
    color: colors.primary,
    textAlign: 'center',
  },
  suggestionsSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  suggestionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
    marginRight: spacing.lg,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  suggestionText: {
    flex: 1,
    alignItems: 'flex-start',
  },
  suggestionBrand: {
    ...typography.small,
    color: colors.textMuted,
  },
  suggestionName: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 2,
  },
  section: {
    paddingTop: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  horizontalList: {
    paddingHorizontal: spacing.lg,
  },
  emptyActivityCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyActivityTitle: {
    ...typography.bodyBold,
    color: colors.primary,
    textAlign: 'center',
  },
  emptyActivitySubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyActivityButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyActivityButtonText: {
    ...typography.captionBold,
    color: colors.textOnPrimary,
  },
  featureCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'flex-start',
    ...shadows.sm,
  },
  featureTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  featureBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  featureSteps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  featureStepPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureStepText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  featureButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  featureButtonText: {
    ...typography.captionBold,
    color: colors.textOnPrimary,
  },
});
