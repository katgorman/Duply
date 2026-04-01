# Duply

A beauty product dupe finder built with React Native and Expo.

## Getting Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Architecture

- **Expo Router** with file-based routing (tabs + stack navigation)
- **Makeup API** as temporary data source (swappable to Firebase)
- **AsyncStorage** for local favorites persistence
- **React Native Reanimated** for smooth animations
- **expo-image** for optimized image loading

## Project Structure

```
app/
  (tabs)/           Tab screens (Home, Favorites, Profile)
  categories.tsx    Categories stack screen
  search.tsx        Search stack screen
  searchResults.tsx Search results with dupe matching
  productDetails.tsx Product comparison view
services/
  api.ts            Data service interface
  makeupApi.ts      Makeup API implementation
  firebaseApi.ts    Firebase stub (for teammate integration)
hooks/
  useProducts.ts    Data fetching hooks
  useFavorites.ts   Favorites persistence hooks
components/
  ProductCard.tsx   Reusable product card
  SkeletonLoader.tsx Loading skeletons
  MatchBadge.tsx    Match percentage badge
constants/
  theme.ts          Design tokens (colors, typography, spacing)
```

## Switching to Firebase

When the Firebase backend is ready, update `services/api.ts`:

```ts
export { firebaseApiService as dataService } from './firebaseApi';
```
