import sys
import unittest
import importlib.util
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

FASTAPI_AVAILABLE = importlib.util.find_spec("fastapi") is not None
backend_main = None
if FASTAPI_AVAILABLE:
    import main as backend_main


@unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi is not installed in the current Python environment")
class AdminJobTests(unittest.TestCase):
    def test_requested_admin_steps_honors_limit(self):
        original_limit = backend_main.ADMIN_JOB_MAX_STEPS_LIMIT
        try:
            backend_main.ADMIN_JOB_MAX_STEPS_LIMIT = 1000
            self.assertEqual(backend_main._requested_admin_steps("1000"), 1000)
            self.assertEqual(backend_main._requested_admin_steps("5000"), 1000)
            self.assertEqual(backend_main._requested_admin_steps(None, default=0), 0)
            self.assertEqual(backend_main._requested_admin_steps(None, default=250), 250)
        finally:
            backend_main.ADMIN_JOB_MAX_STEPS_LIMIT = original_limit


if __name__ == "__main__":
    unittest.main()
