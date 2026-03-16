import { createBrowserRouter } from "react-router";
import { Home } from "./components/Home";
import { ProductDetail } from "./components/ProductDetail";
import { Search } from "./components/Search";
import { Favorites } from "./components/Favorites";
import { Profile } from "./components/Profile";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/product/:id",
    Component: ProductDetail,
  },
  {
    path: "/search",
    Component: Search,
  },
  {
    path: "/favorites",
    Component: Favorites,
  },
  {
    path: "/profile",
    Component: Profile,
  },
]);