import { usePathname } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shadows, spacing, typography } from '../constants/theme';

const HIDDEN_PATHS = new Set(['/', '/profile']);

export default function GlobalBetaBadge() {
  const pathname = usePathname();

  if (!pathname || HIDDEN_PATHS.has(pathname)) {
    return null;
  }

  return (
    <SafeAreaView pointerEvents="none" style={styles.safeOverlay}>
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Beta</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    paddingRight: spacing.lg,
  },
  badge: {
    minWidth: 58,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  badgeText: {
    ...typography.smallBold,
    color: colors.primary,
    textTransform: 'uppercase',
  },
});
