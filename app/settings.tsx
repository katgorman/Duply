import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ArrowLeft, Bell, Database, Search, User } from 'react-native-feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [instantSearchEnabled, setInstantSearchEnabled] = useState(true);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft width={24} height={24} stroke={colors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Experience</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Bell width={20} height={20} stroke={colors.textMuted} />
              <View>
                <Text style={styles.toggleLabel}>Notifications</Text>
                <Text style={styles.toggleHelp}>Saved for future app reminders and product updates</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: colors.accentLight }}
              thumbColor={notificationsEnabled ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Search width={20} height={20} stroke={colors.textMuted} />
              <View>
                <Text style={styles.toggleLabel}>Instant Search Suggestions</Text>
                <Text style={styles.toggleHelp}>Show matching database products while typing</Text>
              </View>
            </View>
            <Switch
              value={instantSearchEnabled}
              onValueChange={setInstantSearchEnabled}
              trackColor={{ false: colors.border, true: colors.accentLight }}
              thumbColor={instantSearchEnabled ? colors.primary : colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Current Setup</Text>
        <View style={styles.card}>
          <InfoRow
            icon={Database}
            title="Product Source"
            value="Bundled product catalog with optional cloud sync"
          />
          <View style={styles.divider} />
          <InfoRow
            icon={Search}
            title="Dupe Engine"
            value="FastAPI backend with model-ranked candidate retrieval"
          />
          <View style={styles.divider} />
          <InfoRow
            icon={User}
            title="Favorites"
            value="Stored locally on this device"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon: Icon, title, value }: { icon: React.FC<any>; title: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon width={20} height={20} stroke={colors.textMuted} />
      <View style={styles.infoContent}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
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
    borderWidth: 1,
    borderColor: colors.border,
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
  toggleLabel: {
    ...typography.caption,
    color: colors.text,
  },
  toggleHelp: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    ...typography.small,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.caption,
    color: colors.text,
    marginTop: 2,
  },
});
