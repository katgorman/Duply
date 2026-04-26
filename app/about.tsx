import { Asset } from 'expo-asset';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ChevronRight, FileText, Mail, Shield } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import { colors, radius, spacing, typography } from '../constants/theme';

const BRAND_LOGO_URI = Asset.fromModule(require('../assets/images/duply-logo-background.svg')).uri;
const BRAND_WORDMARK_URI = Asset.fromModule(require('../assets/images/duply-logo-text.svg')).uri;

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
          <View style={styles.brandLogoFrame}>
            <SvgUri uri={BRAND_LOGO_URI} width="100%" height="100%" />
          </View>
          <View style={styles.brandWordmarkWrap}>
            <SvgUri uri={BRAND_WORDMARK_URI} width="100%" height="100%" />
          </View>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.description}>
            Search the product catalog, open product pages, compare dupes, and check live retailer prices.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>How It Works</Text>
        <View style={styles.card}>
          <InfoRow
            title="Search"
            body="As you type, Duply searches the live catalog and shows quick suggestions so you can jump straight into a specific product."
          />
          <View style={styles.divider} />
          <InfoRow
            title="Pick a Product"
            body="Choose a suggested result to run that exact product through the dupe engine, or press Enter to browse matching catalog results with images and sorting."
          />
          <View style={styles.divider} />
          <InfoRow
            title="Dupe Matching"
            body="We compare products by type, category, price, and rating to find the closest matches and rank them."
          />
          <View style={styles.divider} />
          <InfoRow
            title="Product Pages"
            body="Open any product page to view richer details, save favorites, and check live retailer offers for price matching."
          />
        </View>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <LinkRow icon={FileText} label="Terms of Service" onPress={() => router.push('/terms')} />
          <View style={styles.divider} />
          <LinkRow icon={Shield} label="Privacy Policy" onPress={() => router.push('/privacy')} />
          <View style={styles.divider} />
          <LinkRow icon={Mail} label="Contact Us" onPress={() => Linking.openURL('mailto:support@duply.app')} />
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

function LinkRow({ icon: Icon, label, onPress }: { icon: React.FC<any>; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}>
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
  brandLogoFrame: {
    width: 120,
    height: 120,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  brandLogo: {
    width: 120,
    height: 120,
    marginBottom: spacing.md,
  },
  brandWordmarkWrap: {
    width: 220,
    height: 68,
    marginBottom: spacing.xs,
  },
  brandWordmark: {
    width: 220,
    height: 68,
    marginBottom: spacing.xs,
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
