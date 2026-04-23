import json
import sys
import unittest
from pathlib import Path
from unittest import mock


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main as backend_main
import recommendation_system as rec


class CatalogWarmupTests(unittest.TestCase):
    def test_catalog_guard_starts_warmup_when_catalog_is_not_ready(self):
        with (
            mock.patch.object(backend_main, "is_catalog_loaded", return_value=False),
            mock.patch.object(backend_main, "start_catalog_warmup") as start_warmup,
        ):
            response = backend_main._catalog_guard()

        start_warmup.assert_called_once_with()
        self.assertEqual(response.status_code, 503)

    def test_health_includes_catalog_status_while_warming(self):
        with (
            mock.patch.object(backend_main, "is_catalog_loaded", return_value=False),
            mock.patch.object(
                backend_main,
                "get_catalog_status",
                return_value={"status": "warming", "loaded": False, "error": ""},
            ),
        ):
            response = backend_main.health()

        payload = json.loads(response.body.decode("utf-8"))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(payload["status"], "warming")
        self.assertFalse(payload["catalogReady"])


class RecommendationWarmupTests(unittest.TestCase):
    def setUp(self):
        self.original_background_flag = rec.MODEL_BACKGROUND_WARMUP_ENABLED
        self.original_status = rec._model_status
        self.original_model = rec._model
        self.original_index = rec._index
        self.original_error = rec._model_error

    def tearDown(self):
        rec.MODEL_BACKGROUND_WARMUP_ENABLED = self.original_background_flag
        rec._model_status = self.original_status
        rec._model = self.original_model
        rec._index = self.original_index
        rec._model_error = self.original_error

    def test_find_dupes_loads_model_synchronously_when_background_warmup_is_disabled(self):
        class DummyEmbedding:
            def astype(self, _dtype):
                return self

        class DummyModel:
            def encode(self, _queries, normalize_embeddings=True):
                self.normalize_embeddings = normalize_embeddings
                return DummyEmbedding()

        class DummyIndex:
            def search(self, _embedding, _search_pool):
                return [[0.91]], [[0]]

        rec.MODEL_BACKGROUND_WARMUP_ENABLED = False
        rec._model_status = "uninitialized"
        rec._model = DummyModel()
        rec._index = DummyIndex()

        sentinel = [{"record": {"brand": "Glossier", "product_name": "Cloud Paint"}, "score": 0.91}]
        with (
            mock.patch.object(rec, "_ensure_local_model", return_value=True) as ensure_model,
            mock.patch.object(rec, "_collect_results", return_value=sentinel),
            mock.patch.object(rec, "start_model_warmup") as start_warmup,
        ):
            results = rec.find_dupes("Glossier Cloud Paint")

        ensure_model.assert_called()
        start_warmup.assert_not_called()
        self.assertEqual(results, sentinel)

    def test_find_dupes_uses_fallback_while_background_warmup_runs(self):
        rec.MODEL_BACKGROUND_WARMUP_ENABLED = True
        rec._model_status = "uninitialized"
        sentinel = [{"record": {"brand": "e.l.f."}, "score": 0.42}]

        with (
            mock.patch.object(rec, "start_model_warmup") as start_warmup,
            mock.patch.object(rec, "_fallback_find_dupes", return_value=sentinel) as fallback,
        ):
            results = rec.find_dupes("e.l.f. Halo Glow")

        start_warmup.assert_called_once_with()
        fallback.assert_called_once()
        self.assertEqual(results, sentinel)


if __name__ == "__main__":
    unittest.main()
