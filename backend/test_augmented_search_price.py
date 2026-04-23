import sys
import unittest
import asyncio
import importlib.util
from unittest import mock
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

FASTAPI_AVAILABLE = importlib.util.find_spec("fastapi") is not None
backend_main = None
if FASTAPI_AVAILABLE:
    import main as backend_main

import firestore_products as fp
import web_products as wp


class AugmentedSearchPriceTests(unittest.TestCase):
    def test_supported_price_match_urls_require_official_product_pages(self):
        self.assertTrue(wp.is_supported_price_match_url("https://www.sephora.com/product/test-product-P12345"))
        self.assertTrue(wp.is_supported_price_match_url("https://www.ulta.com/p/test-product?sku=1234567"))
        self.assertFalse(wp.is_supported_price_match_url("https://sephora.nnnow.com/test-product"))
        self.assertFalse(wp.is_supported_price_match_url("https://www.example.com/product/test-product"))

    def test_extract_embedded_page_price_from_constructor_markup(self):
        html = '<div data-cnstrc-item-price="$22.00"></div>'
        self.assertEqual(wp._extract_embedded_page_price(html), 22.0)

    def test_extract_brand_from_product_dash_brand_title(self):
        brand = wp._extract_brand_from_page(
            "",
            {},
            title="Boy Brow Volumizing Eyebrow Gel-Pomade - Glossier",
            retailer="sephora",
        )
        self.assertEqual(brand, "Glossier")

    def test_price_offer_match_confidence_prefers_exact_variant_tokens(self):
        family_only = wp.price_offer_match_confidence(
            "Glossier Cloud Paint Gel Cream Blush",
            "Glossier",
            "Cloud Paint Gel Cream Blush - Puff",
            family_name="Cloud Paint Gel Cream Blush",
        )
        exact_variant = wp.price_offer_match_confidence(
            "Glossier Cloud Paint Gel Cream Blush - Puff",
            "Glossier",
            "Cloud Paint Gel Cream Blush - Puff",
            family_name="Cloud Paint Gel Cream Blush",
        )

        self.assertGreater(exact_variant, family_only)
        self.assertGreaterEqual(exact_variant, 70)

    def test_price_offer_match_confidence_allows_brandless_titles_when_product_tokens_match(self):
        confidence = wp.price_offer_match_confidence(
            "Gloss Bomb Heat Universal Lip Luminizer + Plumper",
            "FENTY BEAUTY by Rihanna",
            "Gloss Bomb Heat Universal Lip Luminizer + Plumper",
        )
        self.assertGreaterEqual(confidence, 60)

    def test_family_aliases_keep_grouped_variants_searchable(self):
        original_loader = fp._load_metadata_products
        original_db = fp.db
        original_metadata_products = fp._metadata_products
        original_metadata_products_by_id = fp._metadata_products_by_id

        sibling_records = [
            fp._prepare_catalog_product({
                "firestore_id": "prod-glossier-cloud-paint-dusk",
                "brand": "Glossier",
                "product_name": "Cloud Paint Gel Cream Blush - Dusk",
                "category": "blush",
                "subcategory": "blush",
                "type": "blush",
                "price": 24,
                "image": "https://example.com/dusk.jpg",
                "raw": {},
            }),
            fp._prepare_catalog_product({
                "firestore_id": "prod-glossier-cloud-paint-puff",
                "brand": "Glossier",
                "product_name": "Cloud Paint Gel Cream Blush - Puff",
                "category": "blush",
                "subcategory": "blush",
                "type": "blush",
                "price": 24,
                "image": "https://example.com/puff.jpg",
                "raw": {},
            }),
        ]

        try:
            fp.db = None
            fp._metadata_products = None
            fp._metadata_products_by_id = None
            fp._load_metadata_products = lambda: sibling_records
            fp.invalidate_catalog_cache()

            family_products = fp._load_catalog_products(force_refresh=True)
            self.assertEqual(len(family_products), 1)

            representative = family_products[0]
            aliases = set(representative.get("_searchAliases") or [])
            self.assertIn("cloud paint gel cream blush dusk", aliases)
            self.assertIn("cloud paint gel cream blush puff", aliases)
            self.assertIn("cloud paint gel cream blush - dusk", aliases)
            self.assertIn("cloud paint gel cream blush - puff", aliases)

            results = fp.search_firestore_products("puff", limit=5)
            self.assertTrue(results)
            self.assertEqual(results[0].get("brand"), "Glossier")
            self.assertEqual(results[0].get("familyName"), "Cloud Paint Gel Cream Blush")
        finally:
            fp._load_metadata_products = original_loader
            fp.db = original_db
            fp._metadata_products = original_metadata_products
            fp._metadata_products_by_id = original_metadata_products_by_id
            fp.invalidate_catalog_cache()

    def test_search_prefers_products_over_accessories_for_family_queries(self):
        original_loader = fp._load_metadata_products
        original_db = fp.db
        original_metadata_products = fp._metadata_products
        original_metadata_products_by_id = fp._metadata_products_by_id

        catalog_records = [
            fp._prepare_catalog_product({
                "firestore_id": "prod-glossier-cloud-paint-brush",
                "brand": "Glossier",
                "product_name": "Cloud Paint Dual-Ended Cheek Blush Brush",
                "category": "tools",
                "subcategory": "tools",
                "type": "tools",
                "price": 28,
                "image": "https://example.com/brush.jpg",
                "raw": {},
            }),
            fp._prepare_catalog_product({
                "firestore_id": "prod-glossier-cloud-paint-blush",
                "brand": "Glossier",
                "product_name": "Cloud Paint Gel Cream Blush",
                "category": "blush",
                "subcategory": "blush",
                "type": "blush",
                "price": 24,
                "image": "https://example.com/blush.jpg",
                "raw": {},
            }),
        ]

        try:
            fp.db = None
            fp._metadata_products = None
            fp._metadata_products_by_id = None
            fp._load_metadata_products = lambda: catalog_records
            fp.invalidate_catalog_cache()

            results = fp.search_firestore_products("glossier cloud paint", limit=5)
            self.assertTrue(results)
            self.assertEqual(results[0].get("product_name"), "Cloud Paint Gel Cream Blush")
        finally:
            fp._load_metadata_products = original_loader
            fp.db = original_db
            fp._metadata_products = original_metadata_products
            fp._metadata_products_by_id = original_metadata_products_by_id
            fp.invalidate_catalog_cache()

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the current Python environment")
    def test_price_matches_return_catalog_offers_without_blocking_on_live_scan(self):
        class DummyRequest:
            def __init__(self, payload):
                self.payload = payload

            async def json(self):
                return self.payload

        payload = {
            "id": "",
            "brand": "Glossier",
            "name": "Cloud Paint Gel Cream Blush - Puff",
            "familyName": "Cloud Paint Gel Cream Blush",
            "productUrl": "https://www.sephora.com/product/cloud-paint-P12345",
        }
        catalog_offer = [{
            "id": "catalog-1",
            "retailer": "sephora",
            "title": "Glossier Cloud Paint Gel Cream Blush - Puff",
            "price": 24.0,
            "url": "https://www.sephora.com/product/cloud-paint-P12345",
            "source": "catalog",
            "matchConfidence": 92,
        }]
        live_offer = [{
            "id": "live-1",
            "retailer": "ulta",
            "title": "Glossier Cloud Paint Gel Cream Blush - Puff",
            "price": 18.0,
            "url": "https://www.ulta.com/p/cloud-paint-pimprod123",
            "source": "dataforseo",
            "matchConfidence": 95,
        }]

        with (
            mock.patch.object(backend_main, "_cache_get", return_value=None),
            mock.patch.object(backend_main, "_cache_set", side_effect=lambda _key, value: value),
            mock.patch.object(backend_main, "get_firestore_product_by_id", return_value=None),
            mock.patch.object(backend_main, "_catalog_price_matches", return_value=catalog_offer),
            mock.patch.object(backend_main, "find_price_matches", return_value=live_offer) as live_lookup,
            mock.patch.object(backend_main, "LIVE_PRICE_MATCHES_ENABLED", True),
        ):
            result = asyncio.run(backend_main.get_price_matches(DummyRequest(payload)))

        self.assertTrue(result)
        self.assertEqual(result[0]["price"], 24.0)
        self.assertEqual(result[0]["retailer"], "sephora")
        live_lookup.assert_not_called()

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the current Python environment")
    def test_price_matches_fall_back_to_request_product_url_when_catalog_is_missing(self):
        class DummyRequest:
            def __init__(self, payload):
                self.payload = payload

            async def json(self):
                return self.payload

        payload = {
            "id": "",
            "brand": "Glossier",
            "name": "Cloud Paint Gel Cream Blush",
            "familyName": "Cloud Paint Gel Cream Blush",
            "price": 24.0,
            "image": "https://example.com/cloud-paint.jpg",
            "productUrl": "https://www.sephora.com/product/cloud-paint-P12345",
        }

        with (
            mock.patch.object(backend_main, "_cache_get", return_value=None),
            mock.patch.object(backend_main, "_cache_set", side_effect=lambda _key, value: value),
            mock.patch.object(backend_main, "get_firestore_product_by_id", return_value=None),
            mock.patch.object(backend_main, "_catalog_price_matches", return_value=[]),
            mock.patch.object(backend_main, "LIVE_PRICE_MATCHES_ENABLED", True),
            mock.patch.object(backend_main, "find_price_matches", return_value=[]) as live_lookup,
        ):
            result = asyncio.run(backend_main.get_price_matches(DummyRequest(payload)))

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["price"], 24.0)
        self.assertEqual(result[0]["url"], payload["productUrl"])
        live_lookup.assert_not_called()

    def test_live_price_match_search_avoids_runtime_url_validation_for_supported_urls(self):
        candidate = {
            "product_name": "Gloss Bomb Heat Universal Lip Luminizer + Plumper",
            "title": "Gloss Bomb Heat Universal Lip Luminizer + Plumper",
            "price": 21.0,
            "website": "ulta",
            "title-href": "https://www.ulta.com/p/gloss-bomb-heat-universal-lip-luminizer-plumper-pimprod2031401?sku=2592391",
            "merchantOffers": [{
                "retailer": "ulta",
                "title": "Gloss Bomb Heat Universal Lip Luminizer + Plumper",
                "price": 21.0,
                "url": "https://www.ulta.com/p/gloss-bomb-heat-universal-lip-luminizer-plumper-pimprod2031401?sku=2592391",
                "shipping": "",
            }],
            "raw": {},
        }

        with (
            mock.patch.object(wp, "_has_dataforseo_credentials", return_value=True),
            mock.patch.object(wp, "_load_persistent_cache", return_value=None),
            mock.patch.object(wp, "_save_persistent_cache"),
            mock.patch.object(wp, "search_web_products", return_value=[candidate]),
            mock.patch.object(wp, "is_live_product_url", side_effect=AssertionError("should not validate live URLs during request-time scan")),
        ):
            offers = wp.find_price_matches(
                "FENTY BEAUTY by Rihanna",
                "Gloss Bomb Heat Universal Lip Luminizer + Plumper",
                family_name="Gloss Bomb Heat Universal Lip Luminizer + Plumper",
                product_url="https://www.ulta.com/p/gloss-bomb-heat-universal-lip-luminizer-plumper-pimprod2031401?sku=2592391",
                limit=3,
            )

        self.assertTrue(offers)
        self.assertEqual(offers[0]["retailer"], "ulta")
        self.assertGreater(offers[0]["price"], 0)


if __name__ == "__main__":
    unittest.main()
