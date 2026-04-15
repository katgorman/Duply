import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Menu, Search, TrendingUp } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProductCard from '../../components/ProductCard';
import { ProductCardSkeleton } from '../../components/SkeletonLoader';
import { colors, gradients, radius, shadows, spacing, typography } from '../../constants/theme';
import { useActivity } from '../../hooks/useActivity';
import { useSearch } from '../../hooks/useProducts';

export default function HomeScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { results, loading: searchLoading, error: searchError, search } = useSearch();
  const { recentViews, loaded: activityLoaded, addRecentSearch } = useActivity();
  const showingSuggestions = query.trim().length > 0;
  const androidAppUrl = ((Constants.expoConfig as any)?.extra?.androidAppUrl || '').trim();

  const openProduct = (id: string, name: string) => {
    addRecentSearch(query);
    router.push({
      pathname: '/searchResults',
      params: { productId: id, productName: name },
    });
    setQuery('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Image source={require('../../assets/images/duply-logo.png')} style={styles.brandLogo} contentFit="contain" />
        <Text style={styles.brand}>duply</Text>
        <Pressable onPress={() => router.push('/categories')} style={styles.menuBtn}>
          <Menu width={24} height={24} stroke={colors.primary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={[...gradients.hero]} style={styles.hero}>
          <View style={styles.kicker}>
            <Text style={styles.kickerText}>Beauty finds, but cheaper</Text>
          </View>
          <View>
            <Text style={styles.heading}>Find Your{'\n'}Perfect Dupe</Text>
          </View>
          <View>
            <Text style={styles.sub}>
              Discover affordable alternatives to your favorite beauty products
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
                    if (results.length > 0) {
                      openProduct(results[0].id, results[0].name);
                    }
                  }}
                  placeholder="Search products..."
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  style={styles.searchInput}
                />
                {searchLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : null}
              </View>

              {showingSuggestions ? (
                <View style={styles.suggestionsPanel}>
                  {searchLoading ? (
                    <View style={styles.suggestionsLoading}>
                      {[1, 2, 3].map(i => (
                        <ProductCardSkeleton key={i} />
                      ))}
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
                          onPress={() => openProduct(item.id, item.name)}
                        >
                          <View style={styles.suggestionText}>
                            <Text style={styles.suggestionBrand}>{item.brand}</Text>
                            <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>
                          </View>
                          <Text style={styles.suggestionPrice}>${item.price.toFixed(2)}</Text>
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
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>Early Demo Disclaimer</Text>
            <Text style={styles.disclaimerBody}>
              Duply is still in its early demo stage, so it does not yet include every makeup product on the market. We
              are also actively working on adding stronger product image support.
            </Text>
          </View>
        </View>

        {Platform.OS === 'web' ? (
          <View style={styles.section}>
            <View style={styles.installCard}>
              <Text style={styles.installTitle}>On iPhone, add Duply to your home screen</Text>
              <Text style={styles.installBody}>
                Open this page in Safari, tap Share, then choose Add to Home Screen. Android users can use the browser
                version too, or install the full app if you share an Android build link.
              </Text>
              {androidAppUrl ? (
                <Pressable onPress={() => Linking.openURL(androidAppUrl)} style={styles.installButton}>
                  <Text style={styles.installButtonText}>Install Android App</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

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
                  name={item.name}
                  brand={item.brand}
                  price={item.price}
                  image={item.image}
                  onPress={() =>
                    router.push({
                      pathname: '/productDetails',
                      params: { id: item.id, productName: item.name },
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  menuBtn: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.lime,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  brandLogo: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  brand: {
    ...typography.hero,
    color: colors.primary,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  hero: {
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
    backgroundColor: colors.lime,
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
    letterSpacing: 0.7,
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
  suggestionPrice: {
    ...typography.captionBold,
    color: colors.primary,
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
  installCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  installTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  installBody: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  installButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  installButtonText: {
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
