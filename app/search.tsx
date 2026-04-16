import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Clock, Search, X } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';
import { useActivity } from '../hooks/useActivity';
import { useSearch } from '../hooks/useProducts';
import { seedProductCache } from '../services/api';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q || '');
  const router = useRouter();
  const { results, loading, error, search } = useSearch();
  const { recentSearches, addRecentSearch, removeRecentSearch } = useActivity();

  const showingSuggestions = query.trim().length > 0;

  useEffect(() => {
    if (params.q) {
      setQuery(params.q);
      search(params.q);
    }
  }, [params.q, search]);

  const removeHistoryItem = (index: number) => {
    const item = recentSearches[index];
    if (item) {
      removeRecentSearch(item);
    }
  };

  const openProduct = (id: string, name: string) => {
    addRecentSearch(query);
    const selected = results.find(item => item.id === id);
    if (selected) {
      seedProductCache(selected);
    }

    router.push({
      pathname: '/searchResults',
      params: { productId: id, productName: name },
    });
  };

  const handleChangeText = (text: string) => {
    setQuery(text);
    search(text);
  };

  const handleSubmit = () => {
    if (!showingSuggestions || results.length === 0) return;
    openProduct(results[0].id, results[0].name);
  };

  const handleHistoryTap = (item: string) => {
    setQuery(item);
    search(item);
  };

  const renderSuggestions = () => {
    if (!showingSuggestions) return null;

    return (
      <View style={styles.suggestionsPanel}>
        <View style={styles.suggestionsHeader}>
          <Text style={styles.suggestionsTitle}>Suggestions</Text>
          <Text style={styles.suggestionsSubtitle}>Press Enter to pick the top result</Text>
        </View>

        {loading ? (
          <View style={styles.suggestionsLoading}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.resultSkeleton} />
            ))}
          </View>
        ) : error ? (
          <View style={styles.suggestionsState}>
            <Text style={styles.stateTitle}>Search unavailable</Text>
            <Text style={styles.stateSubtitle}>{error}</Text>
          </View>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionsList}
            contentContainerStyle={styles.suggestionsListContent}
            ItemSeparatorComponent={() => <View style={styles.resultDivider} />}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.resultItem, pressed && styles.resultItemPressed]}
                onPress={() => openProduct(item.id, item.name)}
              >
                <View style={styles.resultInfo}>
                  <Text style={styles.resultBrand}>{item.brand}</Text>
                  <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.resultPrice}>${item.price.toFixed(2)}</Text>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <View style={styles.suggestionsState}>
            <Text style={styles.stateTitle}>No products found</Text>
            <Text style={styles.stateSubtitle}>Keep typing to narrow the database results</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBarSearch}>
        <View style={styles.topBarRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft width={24} height={24} stroke={colors.primary} />
          </Pressable>
          <Text style={styles.topBarTitle}>Search Products</Text>
        </View>

        <View style={styles.inputWrapper}>
          <Search width={18} height={18} stroke={colors.accent} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
            placeholder="Search for products..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoFocus
            returnKeyType="search"
          />
          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.accent}
              style={styles.spinner}
            />
          ) : null}
        </View>

        {renderSuggestions()}
      </View>

      <View style={styles.content}>
        {!showingSuggestions ? (
          <>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Recent Searches</Text>
            </View>
            <FlatList
              data={recentSearches}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item, index }) => (
                <Pressable
                  style={({ pressed }) => [styles.historyItem, pressed && styles.resultItemPressed]}
                  onPress={() => handleHistoryTap(item)}
                >
                  <View style={styles.historyLeft}>
                    <Clock width={18} height={18} stroke={colors.accent} />
                    <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
                  </View>
                  <Pressable onPress={() => removeHistoryItem(index)} hitSlop={12}>
                    <X width={16} height={16} stroke={colors.textMuted} />
                  </Pressable>
                </Pressable>
              )}
              contentContainerStyle={styles.historyList}
            />
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topBarSearch: {
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    zIndex: 20,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
    marginLeft: -spacing.sm,
  },
  topBarTitle: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 1,
  },
  spinner: {
    position: 'absolute',
    right: spacing.md,
  },
  input: {
    paddingVertical: spacing.lg,
    paddingLeft: 40,
    paddingRight: 40,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    color: colors.primary,
    ...typography.body,
    backgroundColor: colors.surface,
  },
  suggestionsPanel: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.primary,
    maxHeight: 380,
    overflow: 'hidden',
    ...shadows.sm,
  },
  suggestionsHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionsTitle: {
    ...typography.captionBold,
    color: colors.primary,
  },
  suggestionsSubtitle: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  suggestionsLoading: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  resultSkeleton: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.skeleton,
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
  resultDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md,
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  resultItemPressed: {
    opacity: 0.7,
  },
  resultInfo: {
    flex: 1,
  },
  resultBrand: {
    ...typography.small,
    color: colors.textMuted,
  },
  resultName: {
    ...typography.captionBold,
    color: colors.text,
    marginTop: 1,
  },
  resultPrice: {
    ...typography.captionBold,
    color: colors.success,
    marginTop: 2,
  },
  historyHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  historyTitle: {
    ...typography.captionBold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  historyList: {
    paddingBottom: 80,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  historyText: {
    ...typography.caption,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
});
