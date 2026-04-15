import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ChevronRight, FileText, Mail, Shield } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../constants/theme';

export default function AboutScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft width={24} height={24} stroke={colors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandSection}>
          <Image source={require('../assets/images/duply-logo.png')} style={styles.brandLogo} contentFit="contain" />
          <Text style={styles.brandName}>Duply</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.description}>
            Search products from your product catalog, open rich product pages,
            and compare model-ranked dupes with explainable match scores.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>How It Works</Text>
        <View style={styles.card}>
          <InfoRow
            title="Search"
            body="Suggestions come from your database as the user types, then Enter picks the top result."
          />
          <View style={styles.divider} />
          <InfoRow
            title="Product Details"
            body="Each product page can show ingredient, packaging, skin type, size, country, review count, and more."
          />
          <View style={styles.divider} />
          <InfoRow
            title="Dupe Matching"
            body="The backend model ranks likely dupes, and the UI explains each match using overlapping product fields."
          />
        </View>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <LinkRow icon={FileText} label="Terms of Service" />
          <View style={styles.divider} />
          <LinkRow icon={Shield} label="Privacy Policy" />
          <View style={styles.divider} />
          <LinkRow icon={Mail} label="Contact Us" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoBody}>{body}</Text>
    </View>
  );
}

function LinkRow({ icon: Icon, label }: { icon: React.FC<any>; label: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
      <View style={styles.linkLeft}>
        <Icon width={20} height={20} stroke={colors.textMuted} />
        <Text style={styles.linkLabel}>{label}</Text>
      </View>
      <ChevronRight width={18} height={18} stroke={colors.textMuted} />
    </Pressable>
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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  brandSection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  brandLogo: {
    width: 120,
    height: 120,
    marginBottom: spacing.md,
  },
  brandName: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0,
  },
  version: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 24,
    maxWidth: 320,
  },
  sectionLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  infoRow: {
    padding: spacing.lg,
  },
  infoTitle: {
    ...typography.captionBold,
    color: colors.text,
  },
  infoBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  linkLabel: {
    ...typography.caption,
    color: colors.text,
  },
});
