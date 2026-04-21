import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

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


if __name__ == "__main__":
    unittest.main()
