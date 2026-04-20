const WIDTH_QUERY_KEYS = ['imwidth', 'wid', 'width'] as const;
const HEIGHT_QUERY_KEYS = ['hei', 'height'] as const;

function safeParseNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function setMinSearchParam(url: URL, key: string, nextValue: number) {
  const currentValue = safeParseNumber(url.searchParams.get(key));
  if (currentValue < nextValue) {
    url.searchParams.set(key, String(nextValue));
  }
}

export function getOptimizedProductImageUri(image: string | null | undefined, desiredWidth = 640) {
  const trimmed = (image || '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const targetWidth = Math.max(240, Math.round(desiredWidth));
    const retinaWidth = targetWidth * 2;
    const normalizedHost = url.hostname.toLowerCase();

    WIDTH_QUERY_KEYS.forEach(key => {
      if (url.searchParams.has(key)) {
        setMinSearchParam(url, key, retinaWidth);
      }
    });

    HEIGHT_QUERY_KEYS.forEach(key => {
      if (url.searchParams.has(key)) {
        setMinSearchParam(url, key, targetWidth);
      }
    });

    if (normalizedHost.includes('sephora.com') && !url.searchParams.has('imwidth')) {
      url.searchParams.set('imwidth', String(retinaWidth));
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

export function buildProductImageSource(image: string | null | undefined, desiredWidth = 640) {
  const uri = getOptimizedProductImageUri(image, desiredWidth);
  return uri ? { uri } : null;
}
