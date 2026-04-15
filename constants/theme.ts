import { Platform, StyleSheet } from 'react-native';

export const colors = {
  primary: '#8A0005',
  primaryLight: '#b6222a',
  accent: '#B4EBFF',
  accentLight: '#FFE9F6',
  accentDark: '#277a95',
  pink: '#FFBFE9',
  lime: '#FFE9F6',
  red: '#8A0005',
  purple: '#FFBFE9',
  rose: '#FFBFE9',
  softSky: '#B4EBFF',
  wine: '#8A0005',
  clottedCream: '#FFE9F6',
  strawberryMilk: '#FFE9F6',

  gradientStart: '#FFE9F6',
  gradientMid: '#FFBFE9',
  gradientEnd: '#FFE9F6',

  background: '#FFE9F6',
  surface: '#fff3fa',
  surfaceElevated: '#FFE9F6',

  text: '#310002',
  textSecondary: '#6c1b21',
  textMuted: '#8c555b',
  textOnPrimary: '#ffffff',
  textOnAccent: '#310002',

  success: '#277a95',
  successLight: '#FFE9F6',
  warning: '#8A0005',
  error: '#b00020',

  border: 'rgba(138,0,5,0.28)',
  borderAccent: '#8A0005',
  divider: 'rgba(138,0,5,0.18)',

  overlay: 'rgba(0,0,0,0.3)',
  cardShadow: 'rgba(138, 0, 5, 0.18)',

  tabInactive: '#8d5d80',
  tabActive: '#8A0005',
  tabActiveBg: '#FFBFE9',

  skeleton: '#ffd8ef',
  skeletonHighlight: '#fff3fa',
} as const;

export const gradients = {
  main: [colors.strawberryMilk, colors.rose, '#fff3fa'] as const,
  hero: [colors.rose, colors.strawberryMilk, '#fff3fa'] as const,
  header: [colors.rose, colors.strawberryMilk] as const,
  card: ['#fff3fa', colors.strawberryMilk] as const,
  matchScore: [colors.rose, colors.strawberryMilk, '#fff3fa'] as const,
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
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: 0,
  },
  h1: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  h2: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    fontSize: 24,
    fontWeight: '700' as const,
  },
  h3: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    fontSize: 19,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
  captionBold: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  smallBold: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  label: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
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
