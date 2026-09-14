import json
import unittest

from finder.cli import build_parser
from finder.config import SUPPORTED_CATEGORIES, SearchConfig
from finder.dedupe import LocalDeduper, candidate_keys, normalize_domain, normalize_maps_url
from finder.errors import BlockedError
from finder.export import write_jsonl
from finder.models import FinderCandidate, SearchContext


class FinderCoreTests(unittest.TestCase):
    def test_search_config_validates_and_normalizes(self):
        config = SearchConfig(" Inmobiliaria ", " Villa Carlos Paz, Córdoba ", 10)
        self.assertEqual(config.category, "inmobiliaria")
        self.assertEqual(config.location, "Villa Carlos Paz, Córdoba")
        with self.assertRaises(ValueError):
            SearchConfig("inventada", "Córdoba", 10)
        with self.assertRaises(ValueError):
            SearchConfig(SUPPORTED_CATEGORIES[0], "Córdoba", 26)

    def test_candidate_is_json_serializable_and_keeps_context_separate(self):
        candidate = FinderCandidate(
            " Acme  SA ", website="https://www.acme.test/", context=SearchContext.now("inmobiliaria", "Córdoba")
        )
        payload = json.dumps(candidate.to_dict(), ensure_ascii=False)
        self.assertIn("business_name", payload)
        self.assertIn("search_category", payload)

    def test_normalization_and_local_dedupe_priority(self):
        first = FinderCandidate("Acme", website="https://www.acme.test/path", google_maps_url="https://maps.google.com/place/Acme/")
        second = FinderCandidate("Otro nombre", website="https://acme.test/other")
        deduper = LocalDeduper()
        self.assertTrue(deduper.add(first))
        self.assertFalse(deduper.add(second))
        self.assertEqual(normalize_domain(first.website), "acme.test")
        self.assertTrue(normalize_maps_url(first.google_maps_url).startswith("https://maps.google.com"))
        self.assertTrue(candidate_keys(first))

    def test_jsonl_export(self):
        path = __import__("pathlib").Path("tmp/test-finder.jsonl")
        try:
            write_jsonl(path, [FinderCandidate("Acme")])
            self.assertEqual(len(path.read_text(encoding="utf-8").splitlines()), 1)
        finally:
            if path.exists():
                path.unlink()
            if path.parent.exists() and not any(path.parent.iterdir()):
                path.parent.rmdir()

    def test_blocked_error_is_typed(self):
        self.assertEqual(BlockedError.code, "blocked")

    def test_cli_supports_headed_and_headless_modes(self):
        parser = build_parser()
        headed = parser.parse_args(["dry-run", "--category", "inmobiliaria", "--location", "Córdoba", "--headed"])
        headless = parser.parse_args(["dry-run", "--category", "inmobiliaria", "--location", "Córdoba", "--headless"])
        self.assertTrue(headed.headed)
        self.assertTrue(headless.headless)


if __name__ == "__main__":
    unittest.main()
