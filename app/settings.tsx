import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ArrowLeft, Database, Search, Trash2 } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useActivity } from '../hooks/useActivity';
import { useFavorites } from '../hooks/useFavorites';
import { usePreferences } from '../hooks/usePreferences';

type PendingAction = {
  title: string;
  message: string;
  successLabel: string;
  onConfirm: () => void;
} | null;

export default function SettingsScreen() {
  const router = useRouter();
  const { recentSearches, recentViews, clearRecentSearches, clearRecentViews } = useActivity();
  const { favorites, clearFavorites } = useFavorites();
  const { showHigherPricedMatches, setShowHigherPricedMatches, excludeSameBrandDupes, setExcludeSameBrandDupes } = usePreferences();
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setSuccessMessage('');
    }, 2600);

    return () => clearTimeout(timeout);
  }, [successMessage]);

  const confirmAction = (title: string, message: string, successLabel: string, onConfirm: () => void) => {
    setPendingAction({
      title,
      message,
      successLabel,
      onConfirm,
    });
  };

  const handleConfirmedAction = () => {
    if (!pendingAction) {
      return;
    }

    pendingAction.onConfirm();
    setSuccessMessage(pendingAction.successLabel);
    setPendingAction(null);
  };

  const clearAllDupeData = () => {
    clearRecentViews();
    clearRecentSearches();
    clearFavorites();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft width={24} height={24} stroke={colors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {successMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Matching</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Search width={20} height={20} stroke={colors.textMuted} />
              <View style={styles.textBlock}>
                <Text style={styles.toggleLabel}>Hide same-brand dupes</Text>
                <Text style={styles.toggleHelp}>Only show dupes from other brands. Turn off to include products from the same brand as your search.</Text>
              </View>
            </View>
            <Switch
              value={excludeSameBrandDupes}
              onValueChange={setExcludeSameBrandDupes}
              trackColor={{ false: colors.border, true: colors.accentLight }}
              thumbColor={excludeSameBrandDupes ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Search width={20} height={20} stroke={colors.textMuted} />
              <View style={styles.textBlock}>
                <Text style={styles.toggleLabel}>Show matches at the same or higher price than the original query</Text>
                <Text style={styles.toggleHelp}>Off by default — only cheaper dupes are shown. Turn this on to include matches that cost the same or more.</Text>
              </View>
            </View>
            <Switch
              value={showHigherPricedMatches}
              onValueChange={setShowHigherPricedMatches}
              trackColor={{ false: colors.border, true: colors.accentLight }}
              thumbColor={showHigherPricedMatches ? colors.primary : colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <ActionRow
            icon={Database}
            label="Clear recently viewed"
            detail={`${recentViews.length} item${recentViews.length === 1 ? '' : 's'}`}
            onPress={() => confirmAction(
              'Clear recently viewed?',
              'This removes all products from your recently viewed list.',
              'Recently viewed cleared.',
              clearRecentViews,
            )}
          />
          <View style={styles.divider} />
          <ActionRow
            icon={Search}
            label="Clear recent searches"
            detail={`${recentSearches.length} search${recentSearches.length === 1 ? '' : 'es'}`}
            onPress={() => confirmAction(
              'Clear recent searches?',
              'This removes your recent search history on this device.',
              'Recent searches cleared.',
              clearRecentSearches,
            )}
          />
          <View style={styles.divider} />
          <ActionRow
            icon={Trash2}
            label="Clear favorites"
            detail={`${favorites.length} favorite${favorites.length === 1 ? '' : 's'}`}
            onPress={() => confirmAction(
              'Clear favorites?',
              'This removes every saved favorite product.',
              'Favorites cleared.',
              clearFavorites,
            )}
          />
          <View style={styles.divider} />
          <ActionRow
            icon={Trash2}
            label="Clear all dupe data"
            detail="Clears recently viewed, recent searches, and favorites"
            danger
            onPress={() => confirmAction(
              'Clear all dupe data?',
              'This clears recently viewed, recent searches, and favorites all at once.',
              'All dupe data cleared.',
              clearAllDupeData,
            )}
          />
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(pendingAction)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAction(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalCloseLayer} onPress={() => setPendingAction(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{pendingAction?.title}</Text>
            <Text style={styles.modalMessage}>{pendingAction?.message}</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setPendingAction(null)} style={({ pressed }) => [styles.modalButton, styles.modalButtonSecondary, pressed && styles.actionRowPressed]}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirmedAction} style={({ pressed }) => [styles.modalButton, styles.modalButtonDanger, pressed && styles.actionRowPressed]}>
                <Text style={styles.modalButtonDangerText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionRow({
  icon: Icon,
  label,
  detail,
  onPress,
  danger = false,
}: {
  icon: React.FC<any>;
  label: string;
  detail: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}>
      <View style={styles.actionLeft}>
        <Icon width={20} height={20} stroke={danger ? colors.error : colors.textMuted} />
        <View style={styles.textBlock}>
          <Text style={[styles.actionLabel, danger && styles.dangerText]}>{label}</Text>
          <Text style={styles.actionDetail}>{detail}</Text>
        </View>
      </View>
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
    backgroundColor: colors.pink,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  backBtn: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  successBanner: {
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  successText: {
    ...typography.captionBold,
    color: colors.primary,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(42, 11, 38, 0.28)',
  },
  modalCloseLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
  },
  modalMessage: {
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  modalButtonSecondary: {
    backgroundColor: colors.cream,
    borderColor: colors.primary,
  },
  modalButtonDanger: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalButtonSecondaryText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  modalButtonDangerText: {
    ...typography.captionBold,
    color: colors.textOnPrimary,
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
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    gap: spacing.md,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  textBlock: {
    flex: 1,
  },
  toggleLabel: {
    ...typography.caption,
    color: colors.text,
  },
  toggleHelp: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  actionRow: {
    padding: spacing.lg,
  },
  actionRowPressed: {
    opacity: 0.8,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.text,
  },
  actionDetail: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  dangerText: {
    color: colors.error,
  },
});
