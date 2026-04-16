import { Href, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bookmark, Camera, DollarSign, Info, LogOut, RefreshCw, Settings, Star, User } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { useFavorites } from '../../hooks/useFavorites';
import { useProfile } from '../../hooks/useProfile';

function DefaultAvatar() {
  return (
    <View style={styles.defaultAvatarArt}>
      <View style={styles.defaultAvatarHaloLarge} />
      <View style={styles.defaultAvatarHaloSmall} />
      <View style={styles.defaultAvatarBadge}>
        <Image source={require('../../assets/images/duply-logo.png')} style={styles.defaultAvatarLogo} contentFit="contain" />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submitEmail = async () => {
    if (mode === 'signIn') {
      await auth.signInWithEmail(email, password);
      return;
    }
    await auth.signUpWithEmail(email, password, displayName);
  };

  if (auth.user) {
    return <ProfileContent />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.lockedScroll}>
        <View style={styles.lockedHeader}>
          <View style={styles.lockedIconWrap}>
            <User width={34} height={34} stroke={colors.primary} />
          </View>
          <Text style={styles.lockedTitle}>Create Your Profile</Text>
          <Text style={styles.lockedSubtitle}>
            Sign in to save your preferences, keep your dashboard tidy, and make {'d\u00fcply'} feel more personal.
          </Text>
        </View>

        <View style={styles.lockedCard}>
          {!auth.configured ? (
            <View style={styles.authNotice}>
              <Text style={styles.lockedCardTitle}>Firebase setup needed</Text>
              <Text style={styles.lockedCardBody}>
                Add your Firebase web app keys as environment variables to turn on Google and email sign-in.
              </Text>
            </View>
          ) : (
            <>
              <Pressable onPress={auth.signInWithGoogle} style={styles.googleButton} disabled={auth.loading}>
                <Text style={styles.googleMark}>G</Text>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </Pressable>
              {Platform.OS !== 'web' ? (
                <Text style={styles.googleHint}>Google sign-in is currently available on the web build.</Text>
              ) : null}

              <View style={styles.authDivider}>
                <View style={styles.authLine} />
                <Text style={styles.authDividerText}>or use email</Text>
                <View style={styles.authLine} />
              </View>

              <View style={styles.authToggle}>
                <Pressable
                  onPress={() => setMode('signIn')}
                  style={[styles.authToggleButton, mode === 'signIn' && styles.authToggleButtonActive]}
                >
                  <Text style={[styles.authToggleText, mode === 'signIn' && styles.authToggleTextActive]}>Sign In</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('signUp')}
                  style={[styles.authToggleButton, mode === 'signUp' && styles.authToggleButtonActive]}
                >
                  <Text style={[styles.authToggleText, mode === 'signUp' && styles.authToggleTextActive]}>Create Account</Text>
                </Pressable>
              </View>

              {mode === 'signUp' ? (
                <>
                  <Text style={styles.fieldLabel}>Display Name</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Beauty Lover"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />

              {auth.error ? <Text style={styles.authError}>{auth.error}</Text> : null}

              <Pressable onPress={submitEmail} style={styles.primaryButton} disabled={auth.loading}>
                {auth.loading ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>{mode === 'signIn' ? 'Sign In' : 'Create Account'}</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileContent() {
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const { favorites } = useFavorites();
  const { profile, loaded, saving, error, updateProfile, uploadProfilePhoto, resetProfile } = useProfile();

  const savedItems = favorites.length;
  const totalSavings = favorites.reduce((sum, item) => sum + item.savings, 0);
  const savedProducts = favorites.filter(item => (item.kind || 'comparison') === 'product').length;
  const savedComparisons = favorites.filter(item => (item.kind || 'comparison') === 'comparison').length;

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    const asset = result.canceled ? null : result.assets[0];
    if (asset?.uri) {
      await uploadProfilePhoto(asset.uri, asset.mimeType);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={pickProfilePhoto} style={styles.avatarCircle} disabled={saving}>
            {profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <DefaultAvatar />
            )}
          </Pressable>
          <Pressable onPress={pickProfilePhoto} style={styles.photoButton} disabled={saving}>
            <Camera width={16} height={16} stroke={colors.primary} />
            <Text style={styles.photoButtonText}>
              {saving ? 'Saving...' : profile.photoUri ? 'Change Photo' : 'Upload Photo'}
            </Text>
          </Pressable>
          <Text style={styles.name}>{profile.displayName || user?.displayName || 'Beauty Lover'}</Text>
          <Text style={styles.email}>{user?.email || 'Your beauty dupe dashboard'}</Text>
          <Pressable onPress={signOut} style={styles.signOutButton} disabled={authLoading}>
            <LogOut width={16} height={16} stroke={colors.primary} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.statsWrapper}>
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <StatItem icon={Bookmark} value={savedItems} label="Saved" bg={colors.accentLight} color={colors.primary} />
              <StatItem icon={DollarSign} value={`$${totalSavings.toFixed(0)}`} label="Savings" bg={colors.successLight} color={colors.success} />
              <StatItem icon={Star} value={savedComparisons} label="Comparisons" bg={colors.cream} color={colors.primary} />
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
              placeholder="Add a display name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Pressable onPress={pickProfilePhoto} style={styles.secondaryButton} disabled={saving}>
              <Camera width={16} height={16} stroke={colors.primary} />
              <Text style={styles.secondaryButtonText}>{saving ? 'Saving Photo...' : 'Upload Profile Photo'}</Text>
            </Pressable>
            {error ? <Text style={styles.profileError}>{error}</Text> : null}
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
        ) : saving ? (
          <Text style={styles.footerNote}>Saving your synced profile...</Text>
        ) : (
          <Text style={styles.footerNote}>Profile details sync with your signed-in account.</Text>
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

function SettingsRow({ icon: Icon, label, onPress, danger }: any) {
  return (
    <Pressable style={({ pressed }) => [styles.settingsItem, pressed && { opacity: 0.75 }]} onPress={onPress}>
      <View style={styles.settingsLeft}>
        <Icon width={20} height={20} stroke={danger ? colors.error : colors.textMuted} />
        <Text style={[styles.settingsText, danger && { color: colors.error }]}>{label}</Text>
      </View>
      <Text style={styles.chevron}>{'\u203a'}</Text>
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
    backgroundColor: colors.accentLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl + 12,
    alignItems: 'center',
  },
  lockedHeader: {
    backgroundColor: colors.accentLight,
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.softGold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  defaultAvatarArt: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.softGold,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  defaultAvatarHaloLarge: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.pink,
    opacity: 0.95,
    top: 10,
    left: 5,
  },
  defaultAvatarHaloSmall: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentLight,
    borderWidth: 2,
    borderColor: colors.primary,
    bottom: 6,
    right: 6,
  },
  defaultAvatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    zIndex: 1,
  },
  defaultAvatarLogo: {
    width: 40,
    height: 40,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoButtonText: {
    ...typography.smallBold,
    color: colors.primary,
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
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: colors.primary,
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
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  googleMark: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  googleButtonText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  googleHint: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  authNotice: {
    gap: spacing.sm,
  },
  authDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  authLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  authDividerText: {
    ...typography.small,
    color: colors.textMuted,
  },
  authToggle: {
    flexDirection: 'row',
    padding: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  authToggleButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
  },
  authToggleButtonActive: {
    backgroundColor: colors.primary,
  },
  authToggleText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  authToggleTextActive: {
    color: colors.textOnPrimary,
  },
  authError: {
    ...typography.smallBold,
    color: colors.error,
    marginTop: spacing.md,
  },
  profileError: {
    ...typography.smallBold,
    color: colors.error,
    marginTop: spacing.md,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  signOutText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  statsWrapper: {
    marginTop: -24,
    paddingHorizontal: spacing.lg,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
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
    color: colors.primary,
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
    color: colors.primary,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  fieldLabel: {
    ...typography.smallBold,
    color: colors.primary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  secondaryButtonText: {
    ...typography.captionBold,
    color: colors.primary,
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
