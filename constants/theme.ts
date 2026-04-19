import { Platform, StyleSheet } from 'react-native';

export const colors = {
  originalRed: '#8A0005',
  primary: '#2A0B26',
  primaryLight: '#7A1548',
  accent: '#A33100',
  accentLight: '#FFF6F9',
  accentDark: '#7A2400',
  pink: '#FFD1E8',
  cream: '#FFF9F0',
  red: '#B00020',
  purple: '#7A1548',
  rose: '#D61F69',
  softGold: '#FFF2DC',
  wine: '#2A0B26',
  clottedCream: '#FFF7FB',
  strawberryMilk: '#FFD1E8',

  background: '#FFF7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFF6F9',

  text: '#171015',
  textSecondary: '#4A2737',
  textMuted: '#5D4A55',
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',

  success: '#7A2E00',
  successLight: '#FFE8CC',
  warning: '#8A5A00',
  error: '#b00020',

  border: 'rgba(42,11,38,0.24)',
  borderAccent: '#2A0B26',
  divider: 'rgba(42,11,38,0.16)',

  overlay: 'rgba(0,0,0,0.3)',
  cardShadow: 'rgba(42, 11, 38, 0.18)',

  tabInactive: '#5D4A55',
  tabActive: '#2A0B26',
  tabActiveBg: '#FFD1E8',

  skeleton: '#F2D6E3',
  skeletonHighlight: '#FFF7FB',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 34,
  xxxl: 52,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  full: 999,
} as const;

export const typography = {
  hero: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: 0,
  },
  h1: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: 0,
  },
  h2: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 24,
    fontWeight: '800' as const,
  },
  h3: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 19,
    fontWeight: '800' as const,
  },
  body: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 16,
    fontWeight: '700' as const,
  },
  caption: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 14,
    fontWeight: '400' as const,
  },
  captionBold: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 14,
    fontWeight: '700' as const,
  },
  small: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 12,
    fontWeight: '400' as const,
  },
  smallBold: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 12,
    fontWeight: '700' as const,
  },
  label: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0,
    textTransform: 'uppercase' as const,
  },
} as const;

export const shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 18,
    },
    android: { elevation: 6 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 1,
      shadowRadius: 28,
    },
    android: { elevation: 10 },
    default: {},
  }),
} as const;

export const shared = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContainer: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  pillButtonText: {
    color: colors.textOnPrimary,
    ...typography.captionBold,
  },
});
