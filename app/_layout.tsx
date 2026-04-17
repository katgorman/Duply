import { Stack } from 'expo-router';
import React from 'react';
import AppInstallPrompt from '../components/AppInstallPrompt';
import GlobalBetaBadge from '../components/GlobalBetaBadge';
import { ActivityProvider } from '../contexts/ActivityContext';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { PreferencesProvider } from '../contexts/PreferencesContext';
import { ProfileProvider } from '../contexts/ProfileContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <PreferencesProvider>
          <ActivityProvider>
            <FavoritesProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="search" />
                <Stack.Screen name="searchCatalog" />
                <Stack.Screen name="searchResults" />
                <Stack.Screen name="productDetails" />
                <Stack.Screen name="categoryProducts" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="about" />
                <Stack.Screen name="terms" />
                <Stack.Screen name="privacy" />
              </Stack>
              <GlobalBetaBadge />
              <AppInstallPrompt />
            </FavoritesProvider>
          </ActivityProvider>
        </PreferencesProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}
