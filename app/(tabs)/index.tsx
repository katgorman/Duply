import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Search, TrendingUp } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProductCard from '../../components/ProductCard';
import { ProductCardSkeleton } from '../../components/SkeletonLoader';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useActivity } from '../../hooks/useActivity';
import { useSearch } from '../../hooks/useProducts';
import { prefetchDupesForProduct, seedProductCache } from '../../services/api';

function MarqueeLogo() {
  return (
    <View style={styles.marqueeLogoFrame}>
      <Image
        source={require('../../assets/images/duply-wordmark.png')}
        style={styles.marqueeLogoImage}
        contentFit="contain"
        accessibilityLabel={"d\u00fcply"}
      />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const { results, loading: searchLoading, error: searchError, search } = useSearch();
  const { recentViews, loaded: activityLoaded, addRecentSearch } = useActivity();
  const showingSuggestions = query.trim().length > 1;
  const marqueeOffset = useSharedValue(0);
  const marqueeItemWidth = 120;
  const marqueeRepeatCount = Math.max(8, Math.ceil(width / marqueeItemWidth) + 4);
  const marqueeTrackWidth = marqueeItemWidth * marqueeRepeatCount;

  useEffect(() => {
    marqueeOffset.value = 0;
    marqueeOffset.value = withRepeat(
      withTiming(-marqueeTrackWidth, {
        duration: 22000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [marqueeOffset, marqueeTrackWidth]);

  const marqueeTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeOffset.value }],
  }));

  const marqueeTrackCloneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeOffset.value + marqueeTrackWidth }],
  }));

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
            <Image source={require('../../assets/images/duply-logo.png')} style={styles.brandLogoImage} contentFit="contain" />
          </View>
        </Pressable>
        <View style={styles.brandWordmarkFrame}>
          <Image
            source={require('../../assets/images/duply-wordmark.png')}
            style={styles.brandWordmarkImage}
            contentFit="contain"
            accessibilityLabel={"d\u00fcply"}
          />
        </View>
        <View style={[styles.topSideSlot, styles.topSideSlotRight]}>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>Beta</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.marqueeBand} pointerEvents="none">
          <Animated.View style={[styles.marqueeTrack, marqueeTrackStyle]}>
            {Array.from({ length: marqueeRepeatCount }, (_, index) => (
              <MarqueeLogo key={`duply-track-a-${index}`} />
            ))}
          </Animated.View>
          <Animated.View style={[styles.marqueeTrack, marqueeTrackStyle, styles.marqueeTrackClone, marqueeTrackCloneStyle]}>
            {Array.from({ length: marqueeRepeatCount }, (_, index) => (
              <MarqueeLogo key={`duply-track-b-${index}`} />
            ))}
          </Animated.View>
        </View>

        <View style={styles.hero}>
          <View style={styles.kicker}>
            <Text style={styles.kickerText}>Compare beauty finds and price match them</Text>
          </View>
          <View>
            <Text style={styles.heading}>Find Your{'\n'}Perfect Dupe</Text>
          </View>
          <View>
            <Text style={styles.sub}>
              Discover affordable alternatives to your favorite beauty products and scan live price-match offers.
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
                      <Text style={styles.suggestionsSubtitle}>Keep typing to narrow the database results</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>Current Known Issues</Text>
            <Text style={styles.disclaimerBody}>
              Some catalog coverage is still incomplete, some product images or live retailer matches can be missing,
              and crawl-based retailer data may lag behind the latest store inventory. Search quality and product-family
              grouping are improving, but a few results can still feel imperfect while the catalog continues to sync.
            </Text>
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
  betaBadge: {
    minWidth: 60,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betaBadgeText: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
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
  marqueeBand: {
    height: 60,
    overflow: 'hidden',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    backgroundColor: colors.cream,
    justifyContent: 'center',
  },
  marqueeTrack: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  marqueeTrackClone: {
    left: 0,
  },
  marqueeLogoFrame: {
    width: 120,
    height: 52,
    overflow: 'hidden',
    opacity: 0.42,
  },
  marqueeLogoImage: {
    width: 250,
    height: 78,
    marginLeft: -58,
    marginTop: -10,
  },
  hero: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    overflow: 'visible',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    borderBottomWidth: 2,
    borderColor: colors.primary,
  },
  kicker: {
    alignSelf: 'center',
    backgroundColor: colors.cream,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  kickerText: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
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
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
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
    ...shadows.sm,
  },
  emptyActivityTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  emptyActivitySubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  emptyActivityButton: {
    alignSelf: 'flex-start',
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
  disclaimerCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  disclaimerTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  disclaimerBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
