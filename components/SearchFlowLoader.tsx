import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../constants/theme';

interface SearchFlowLoaderProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export default function SearchFlowLoader({
  title = 'Tracing the product through the model',
  subtitle = 'Pulling live product data, encoding it, and surfacing grounded matches.',
  compact = false,
}: SearchFlowLoaderProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const progress = useSharedValue(0);

  const steps = useMemo(
    () => [
      'Read the query',
      'Pull catalog results',
      'Run model matching',
      'Check live links',
    ],
    []
  );

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: compact ? 1600 : 1900,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false
    );

    const interval = setInterval(() => {
      setStepIndex(current => (current + 1) % steps.length);
    }, compact ? 800 : 950);

    return () => clearInterval(interval);
  }, [compact, progress, steps.length]);

  const animatedRailStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], compact ? [-72, 72] : [-98, 98]),
      },
    ],
    opacity: interpolate(progress.value, [0, 0.15, 0.85, 1], [0.35, 0.9, 0.9, 0.35]),
  }));

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text>

      <View style={styles.pipeline}>
        <View style={styles.pipelineTrack} />
        <Animated.View style={[styles.pipelineRail, compact && styles.pipelineRailCompact, animatedRailStyle]} />
        {steps.map((step, index) => {
          const isActive = index === stepIndex;
          const isComplete = index < stepIndex;

          return (
            <View key={step} style={styles.pipelineNodeWrap}>
              <View
                style={[
                  styles.pipelineNode,
                  isComplete && styles.pipelineNodeComplete,
                  isActive && styles.pipelineNodeActive,
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.stepList}>
        {steps.map((step, index) => {
          const isActive = index === stepIndex;
          const isComplete = index < stepIndex;

          return (
            <View key={step} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  isComplete && styles.stepDotComplete,
                  isActive && styles.stepDotActive,
                ]}
              />
              <Text
                style={[
                  styles.stepText,
                  compact && styles.stepTextCompact,
                  isActive && styles.stepTextActive,
                  isComplete && styles.stepTextComplete,
                ]}
              >
                {step}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
  },
  cardCompact: {
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  title: {
    ...typography.captionBold,
    color: colors.primary,
  },
  titleCompact: {
    ...typography.smallBold,
  },
  subtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  subtitleCompact: {
    lineHeight: 16,
  },
  pipeline: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    position: 'relative',
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pipelineTrack: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  pipelineRail: {
    position: 'absolute',
    left: '50%',
    marginLeft: -24,
    width: 48,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  pipelineRailCompact: {
    width: 40,
    marginLeft: -20,
  },
  pipelineNodeWrap: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipelineNode: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  pipelineNodeActive: {
    backgroundColor: colors.accent,
    transform: [{ scale: 1.08 }],
  },
  pipelineNodeComplete: {
    backgroundColor: colors.primary,
  },
  stepList: {
    gap: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.accent,
  },
  stepDotComplete: {
    backgroundColor: colors.primary,
  },
  stepText: {
    ...typography.small,
    color: colors.textMuted,
  },
  stepTextCompact: {
    fontSize: 12,
  },
  stepTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepTextComplete: {
    color: colors.text,
  },
});
