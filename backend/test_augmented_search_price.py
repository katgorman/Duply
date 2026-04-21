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

    @unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the current Python environment")
    def test_price_matches_merge_live_offers_even_when_catalog_exists(self):
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
            mock.patch.object(backend_main, "find_price_matches", return_value=live_offer),
            mock.patch.object(backend_main, "LIVE_PRICE_MATCHES_ENABLED", True),
        ):
            result = asyncio.run(backend_main.get_price_matches(DummyRequest(payload)))

        self.assertTrue(result)
        self.assertEqual(result[0]["price"], 18.0)
        self.assertEqual(result[0]["retailer"], "ulta")


if __name__ == "__main__":
    unittest.main()
