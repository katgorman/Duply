import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bookmark, DollarSign, Info, Lock, RefreshCw, Settings, Star, User } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useFavorites } from '../../hooks/useFavorites';
import { useProfile } from '../../hooks/useProfile';

const PROFILE_FEATURE_AVAILABLE = false;
const SKIN_TYPES = ['Dry', 'Oily', 'Combination', 'Sensitive', 'Normal'];
const FAVORITE_CATEGORIES = ['Foundation', 'Lipstick', 'Mascara', 'Blush', 'Eyeshadow', 'Bronzer'];
const BUDGETS = ['Under $15', '$15-$25', '$25-$50', '$50+'];

export default function ProfileScreen() {
  if (!PROFILE_FEATURE_AVAILABLE) {
    return <ProfileUnavailableScreen />;
  }

  return <LegacyProfileContent />;
}

function ProfileUnavailableScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.lockedScroll}>
        <LinearGradient colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]} style={styles.lockedHeader}>
          <View style={styles.lockedIconWrap}>
            <Lock width={34} height={34} stroke={colors.primary} />
          </View>
          <Text style={styles.lockedTitle}>Profile Isn&apos;t Available Yet</Text>
          <Text style={styles.lockedSubtitle}>
            We&apos;re still building this feature. Your existing profile functionality is preserved, but it&apos;s hidden
            from users for now.
          </Text>
        </LinearGradient>

        <View style={styles.lockedCard}>
          <Text style={styles.lockedCardTitle}>What you can use instead</Text>
          <Text style={styles.lockedCardBody}>
            Keep exploring dupes, saving favorites, and browsing products while we finish the profile experience.
          </Text>
          <Pressable onPress={() => router.push('/about' as Href)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Learn More About Duply</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LegacyProfileContent() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { profile, loaded, updateProfile, resetProfile } = useProfile();

  const savedItems = favorites.length;
  const totalSavings = favorites.reduce((sum, item) => sum + item.savings, 0);
  const savedProducts = favorites.filter(item => (item.kind || 'comparison') === 'product').length;
  const savedComparisons = favorites.filter(item => (item.kind || 'comparison') === 'comparison').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <LinearGradient colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]} style={styles.header}>
          <View style={styles.avatarCircle}>
            <User width={32} height={32} stroke={colors.primary} />
          </View>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.email}>Your beauty dupe dashboard</Text>
        </LinearGradient>

        <View style={styles.statsWrapper}>
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <StatItem icon={Bookmark} value={savedItems} label="Saved" bg={colors.accentLight} color={colors.primary} />
              <StatItem icon={DollarSign} value={`$${totalSavings.toFixed(0)}`} label="Savings" bg={colors.successLight} color={colors.success} />
              <StatItem icon={Star} value={savedComparisons} label="Comparisons" bg="#fff3a8" color="#8a4b00" />
            </View>
            <Text style={styles.statsCaption}>
              {savedProducts} saved product page{savedProducts === 1 ? '' : 's'} and {savedComparisons} saved dupe comparison{savedComparisons === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              value={profile.displayName}
              onChangeText={text => updateProfile({ displayName: text })}
              placeholder="Add your name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Skin Type</Text>
            <View style={styles.chipsWrap}>
              {SKIN_TYPES.map(item => (
                <Chip
                  key={item}
                  label={item}
                  active={profile.skinType === item}
                  onPress={() => updateProfile({ skinType: item })}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Favorite Category</Text>
            <View style={styles.chipsWrap}>
              {FAVORITE_CATEGORIES.map(item => (
                <Chip
                  key={item}
                  label={item}
                  active={profile.favoriteCategory === item}
                  onPress={() => updateProfile({ favoriteCategory: item })}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Budget</Text>
            <View style={styles.chipsWrap}>
              {BUDGETS.map(item => (
                <Chip
                  key={item}
                  label={item}
                  active={profile.budget === item}
                  onPress={() => updateProfile({ budget: item })}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Links</Text>
          <View style={styles.card}>
            <SettingsRow icon={Settings} label="Settings" onPress={() => router.push('/settings' as Href)} />
            <SettingsRow icon={Info} label="About" onPress={() => router.push('/about' as Href)} />
            <SettingsRow icon={RefreshCw} label="Reset Profile" onPress={resetProfile} danger />
          </View>
        </View>

        {!loaded ? (
          <Text style={styles.footerNote}>Loading your profile...</Text>
        ) : (
          <Text style={styles.footerNote}>Profile preferences are stored locally on this device.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ icon: Icon, value, label, bg, color }: any) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Icon width={20} height={20} stroke={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SettingsRow({ icon: Icon, label, onPress, danger }: any) {
  return (
    <Pressable style={({ pressed }) => [styles.settingsItem, pressed && { opacity: 0.75 }]} onPress={onPress}>
      <View style={styles.settingsLeft}>
        <Icon width={20} height={20} stroke={danger ? colors.error : colors.textMuted} />
        <Text style={[styles.settingsText, danger && { color: colors.error }]}>{label}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  lockedScroll: {
    paddingBottom: spacing.xxxl,
    minHeight: '100%',
  },
  header: {
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl + 12,
    alignItems: 'center',
  },
  lockedHeader: {
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  lockedIconWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  name: {
    ...typography.h2,
    color: colors.primary,
  },
  email: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  lockedTitle: {
    ...typography.h2,
    color: colors.primary,
    textAlign: 'center',
  },
  lockedSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 320,
    lineHeight: 21,
  },
  lockedCard: {
    marginHorizontal: spacing.lg,
    marginTop: -28,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    ...shadows.md,
  },
  lockedCardTitle: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  lockedCardBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    ...typography.captionBold,
    color: colors.textOnPrimary,
  },
  statsWrapper: {
    marginTop: -24,
    paddingHorizontal: spacing.lg,
  },
  statsCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    ...shadows.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.h3,
    color: colors.text,
  },
  statLabel: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsCaption: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    ...shadows.sm,
  },
  fieldLabel: {
    ...typography.smallBold,
    color: colors.primary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.tabActiveBg,
    borderColor: colors.borderAccent,
  },
  chipText: {
    ...typography.small,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsText: {
    ...typography.caption,
    color: colors.text,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
  },
  footerNote: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
});
