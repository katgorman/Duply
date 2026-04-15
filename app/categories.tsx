import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from '../components/SkeletonLoader';
import { colors, gradients, radius, shadows, spacing, typography } from '../constants/theme';
import { useCategories } from '../hooks/useProducts';

export default function CategoriesScreen() {
  const router = useRouter();
  const { data: categories, loading } = useCategories();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft width={24} height={24} stroke={colors.primary} />
        </Pressable>
        <Text style={styles.title}>Categories</Text>
        <View style={{ width: 40 }} />
      </View>

      <LinearGradient colors={[...gradients.main]} style={styles.content}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {loading ? (
            [1, 2, 3, 4].map(i => (
              <Skeleton key={i} width="100%" height={120} borderRadius={radius.lg} style={{ marginBottom: spacing.lg }} />
            ))
          ) : (
            (categories || []).map((cat, i) => (
              <Animated.View key={cat.id} entering={FadeInDown.delay(i * 100).duration(400)}>
                <Pressable
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/categoryProducts',
                      params: { category: cat.productType, title: cat.name },
                    })
                  }
                >
                  <View style={[styles.cardGradient, { backgroundColor: cat.color }]}>
                    <Text style={[styles.cardText, cat.id === 'other' && styles.cardTextDark]}>{cat.name}</Text>
                    <Text style={[styles.cardStar, cat.id === 'other' && styles.cardStarDark]}>*</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topBar: {
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
  title: {
    ...typography.h2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cardGradient: {
    height: 124,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cardText: {
    ...typography.h2,
    color: colors.text,
    textTransform: 'uppercase',
    zIndex: 1,
  },
  cardTextDark: {
    color: colors.surface,
  },
  cardStar: {
    position: 'absolute',
    right: spacing.xl,
    bottom: -4,
    fontSize: 76,
    color: colors.primary,
    lineHeight: 82,
  },
  cardStarDark: {
    color: colors.cream,
  },
});
