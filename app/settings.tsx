import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ArrowLeft, Database, Search, Trash2 } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useActivity } from '../hooks/useActivity';
import { useFavorites } from '../hooks/useFavorites';
import { usePreferences } from '../hooks/usePreferences';

export default function SettingsScreen() {
  const router = useRouter();
  const { recentSearches, recentViews, clearRecentSearches, clearRecentViews } = useActivity();
  const { favorites, clearFavorites } = useFavorites();
  const { showHigherPricedMatches, setShowHigherPricedMatches } = usePreferences();

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onConfirm },
    ]);
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
        <Text style={styles.sectionLabel}>Matching</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Search width={20} height={20} stroke={colors.textMuted} />
              <View style={styles.textBlock}>
                <Text style={styles.toggleLabel}>Show matches at higher price points than the original query</Text>
                <Text style={styles.toggleHelp}>Turn this on to include strong matches even when they cost more.</Text>
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
              clearAllDupeData,
            )}
          />
        </View>
      </ScrollView>
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
