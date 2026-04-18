import { Href, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, Heart, Info, LogOut, RefreshCw, Settings, User, X } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { useFavorites } from '../../hooks/useFavorites';
import { useProfile } from '../../hooks/useProfile';

function DefaultAvatar() {
  return (
    <View style={styles.defaultAvatarArt}>
      <View style={styles.defaultAvatarCircle}>
        <View style={styles.defaultAvatarHead} />
        <View style={styles.defaultAvatarBody} />
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
                    placeholder="Display Name"
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
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);

  const savedProducts = favorites.length;

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
          <View style={styles.heroGlow} />
          <View style={styles.heroPanel}>
            <Pressable onPress={() => setShowPhotoPreview(true)} style={styles.avatarCircle}>
              {profile.photoUri ? (
                <Image source={{ uri: profile.photoUri }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <DefaultAvatar />
              )}
            </Pressable>
            <Text style={styles.profileEyebrow}>Your Profile</Text>
            <Text style={styles.name}>{profile.displayName || user?.displayName || 'Display Name'}</Text>
            <Text style={styles.email}>{user?.email || 'Your beauty dupe dashboard'}</Text>

            <View style={styles.heroBadgeRow}>
              <Pressable onPress={() => router.push('/favorites' as Href)} style={({ pressed }) => [styles.heroBadge, pressed && styles.statItemPressed]}>
                <Heart width={14} height={14} stroke={colors.primary} />
                <Text style={styles.heroBadgeText}>{savedProducts} favorites</Text>
              </Pressable>
              <View style={styles.heroBadge}>
                <View style={[styles.syncDot, saving ? styles.syncDotActive : loaded ? styles.syncDotReady : styles.syncDotIdle]} />
                <Text style={styles.heroBadgeText}>{saving ? 'Syncing' : loaded ? 'Synced' : 'Loading'}</Text>
              </View>
            </View>

            <View style={styles.heroActionRow}>
              <Pressable onPress={pickProfilePhoto} style={styles.photoButton} disabled={saving}>
                <Camera width={16} height={16} stroke={colors.primary} />
                <Text style={styles.photoButtonText}>
                  {saving ? 'Saving...' : profile.photoUri ? 'Change Photo' : 'Upload Photo'}
                </Text>
              </Pressable>
              <Pressable onPress={signOut} style={styles.signOutButton} disabled={authLoading}>
                <LogOut width={16} height={16} stroke={colors.primary} />
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </View>
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

      <Modal
        visible={showPhotoPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoPreview(false)}
      >
        <View style={styles.previewBackdrop}>
          <Pressable style={styles.previewDismissLayer} onPress={() => setShowPhotoPreview(false)} />
          <View style={styles.previewCard}>
            <Pressable style={styles.previewCloseButton} onPress={() => setShowPhotoPreview(false)}>
              <X width={20} height={20} stroke={colors.textOnPrimary} />
            </Pressable>
            <View style={styles.previewAvatarFrame}>
              {profile.photoUri ? (
                <Image source={{ uri: profile.photoUri }} style={styles.previewAvatarImage} contentFit="cover" />
              ) : (
                <View style={styles.previewDefaultAvatar}>
                  <DefaultAvatar />
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: 18,
    right: spacing.xl,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.surface,
    opacity: 0.38,
  },
  heroPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    ...shadows.md,
  },
  lockedHeader: {
    backgroundColor: colors.accentLight,
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
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
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultAvatarCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  defaultAvatarHead: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
  defaultAvatarBody: {
    width: 44,
    height: 24,
    borderRadius: 18,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flex: 1,
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
    textAlign: 'center',
  },
  email: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  profileEyebrow: {
    ...typography.smallBold,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
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
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    flex: 1,
  },
  signOutText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  statItemPressed: {
    opacity: 0.8,
  },
  heroBadgeText: {
    ...typography.smallBold,
    color: colors.primary,
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  syncDotIdle: {
    backgroundColor: colors.textMuted,
  },
  syncDotReady: {
    backgroundColor: colors.primary,
  },
  syncDotActive: {
    backgroundColor: colors.accent,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: '100%',
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42, 11, 38, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  previewDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    ...shadows.md,
  },
  previewCloseButton: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  previewAvatarFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarImage: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.skeleton,
  },
  previewDefaultAvatar: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.softGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
