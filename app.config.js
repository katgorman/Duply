const appJson = require('./app.json');

module.exports = ({ config }) => {
  const expoConfig = appJson.expo || {};
  const extra = expoConfig.extra || {};
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || extra?.eas?.projectId;

  return {
    ...config,
    ...expoConfig,
    extra: {
      ...extra,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiBaseUrl || '',
      eas: {
        ...(extra.eas || {}),
        ...(projectId ? { projectId } : {}),
      },
    },
  };
};
