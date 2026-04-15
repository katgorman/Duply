import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../constants/theme';

const DISMISSED_KEY = '@duply_install_prompt_dismissed';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;

  const navigatorStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigatorStandalone);
}

function isIosSafari() {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isWebKit = /WebKit/i.test(ua);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

  return isIos && isWebKit && !isOtherBrowser;
}

export default function AppInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    let mounted = true;

    const loadState = async () => {
      const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
      if (!mounted || dismissed === 'true' || isStandaloneMode()) return;

      if (isIosSafari()) {
        setShowIosInstructions(true);
        setVisible(true);
      }
    };

    loadState();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isStandaloneMode()) return;
      setDeferredPrompt(event as InstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      mounted = false;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const dismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(DISMISSED_KEY, 'true');
  };

  const install = async () => {
    if (!deferredPrompt) {
      await dismiss();
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      setVisible(false);
      return;
    }

    await dismiss();
  };

  if (Platform.OS !== 'web' || !visible) {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>Keep Duply on your home screen</Text>
        <Text style={styles.body}>
          {showIosInstructions
            ? 'In Safari, tap Share, then choose Add to Home Screen for fast access any time.'
            : 'Install Duply for quicker launches and a more app-like experience.'}
        </Text>
        <View style={styles.actions}>
          {!showIosInstructions && deferredPrompt ? (
            <Pressable style={styles.primaryButton} onPress={install}>
              <Text style={styles.primaryText}>Install</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondaryButton} onPress={dismiss}>
            <Text style={styles.secondaryText}>{showIosInstructions ? 'Got it' : 'Maybe later'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    zIndex: 200,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.lg,
  },
  title: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryText: {
    ...typography.captionBold,
    color: colors.textOnPrimary,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    ...typography.captionBold,
    color: colors.primary,
  },
});
