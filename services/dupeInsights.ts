import type { Dupe, Product } from './api';

type ConfidenceBand = 'High Confidence' | 'Strong Match' | 'Promising Match' | 'Needs Review';

export interface ComparisonStat {
  label: string;
  originalValue: string;
  dupeValue: string;
  winner: 'original' | 'dupe' | 'tie';
}

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeReasonLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^same /i.test(trimmed)) {
    return toTitleCase(trimmed);
  }

  if (/^similar /i.test(trimmed) || /^very /i.test(trimmed)) {
    return toTitleCase(trimmed);
  }

  return toTitleCase(trimmed);
}

function formatPrice(value?: number) {
  if (!value || value <= 0) {
    return 'N/A';
  }
  return `$${value.toFixed(2)}`;
}

function formatCount(value?: number) {
  if (!value || value <= 0) {
    return 'N/A';
  }
  return value.toLocaleString();
}

function formatText(value?: string) {
  const trimmed = (value || '').trim();
  return trimmed || 'N/A';
}

export function getConfidenceBand(similarity: number): ConfidenceBand {
  if (similarity >= 85) {
    return 'High Confidence';
  }
  if (similarity >= 72) {
    return 'Strong Match';
  }
  if (similarity >= 58) {
    return 'Promising Match';
  }
  return 'Needs Review';
}

export function getConfidenceSummary(similarity: number) {
  const band = getConfidenceBand(similarity);
  if (band === 'High Confidence') {
    return 'This dupe lines up closely on type, price, and product details.';
  }
  if (band === 'Strong Match') {
    return 'This pick shares several strong match signals and is worth comparing closely.';
  }
  if (band === 'Promising Match') {
    return 'This match looks promising, but a few product details may differ.';
  }
  return 'This result is usable as a starting point, but it needs a closer manual check.';
}

export function getMatchReasonLabels(matchReason?: string) {
  return (matchReason || '')
    .split(',')
    .map(part => normalizeReasonLabel(part))
    .filter(Boolean);
}

function compareNumericPreference(originalValue: number, dupeValue: number, lowerIsBetter = false) {
  if (originalValue <= 0 || dupeValue <= 0) {
    return 'tie' as const;
  }
  if (Math.abs(originalValue - dupeValue) < 0.01) {
    return 'tie' as const;
  }
  if (lowerIsBetter) {
    return dupeValue < originalValue ? 'dupe' as const : 'original' as const;
  }
  return dupeValue > originalValue ? 'dupe' as const : 'original' as const;
}

function compareTextEquality(originalValue?: string, dupeValue?: string) {
  const left = (originalValue || '').trim().toLowerCase();
  const right = (dupeValue || '').trim().toLowerCase();
  if (!left || !right) {
    return 'tie' as const;
  }
  return left === right ? 'tie' as const : 'original' as const;
}

export function buildComparisonStats(original: Product, dupe: Product): ComparisonStat[] {
  return [
    {
      label: 'Price',
      originalValue: formatPrice(original.price),
      dupeValue: formatPrice(dupe.price),
      winner: compareNumericPreference(original.price, dupe.price, true),
    },
    {
      label: 'Rating',
      originalValue: original.rating > 0 ? original.rating.toFixed(1) : 'N/A',
      dupeValue: dupe.rating > 0 ? dupe.rating.toFixed(1) : 'N/A',
      winner: compareNumericPreference(original.rating, dupe.rating, false),
    },
    {
      label: 'Reviews',
      originalValue: formatCount(original.numberOfReviews),
      dupeValue: formatCount(dupe.numberOfReviews),
      winner: compareNumericPreference(original.numberOfReviews || 0, dupe.numberOfReviews || 0, false),
    },
    {
      label: 'Type',
      originalValue: formatText(toTitleCase(original.productType || original.category)),
      dupeValue: formatText(toTitleCase(dupe.productType || dupe.category)),
      winner: compareTextEquality(original.productType || original.category, dupe.productType || dupe.category),
    },
    {
      label: 'Packaging',
      originalValue: formatText(toTitleCase(original.packagingType || '')),
      dupeValue: formatText(toTitleCase(dupe.packagingType || '')),
      winner: compareTextEquality(original.packagingType, dupe.packagingType),
    },
    {
      label: 'Size',
      originalValue: formatText(original.productSize),
      dupeValue: formatText(dupe.productSize),
      winner: compareTextEquality(original.productSize, dupe.productSize),
    },
  ];
}

export function getDupeCallout(dupe: Dupe) {
  const confidence = getConfidenceBand(dupe.similarity);
  const reasonLabels = getMatchReasonLabels(dupe.matchReason);
  const savings = Math.max(dupe.savings || 0, 0);
  return {
    confidence,
    reasonLabels,
    savingsText: savings > 0 ? `Save $${savings.toFixed(2)}` : 'Price is similar',
    summary: getConfidenceSummary(dupe.similarity),
  };
}
