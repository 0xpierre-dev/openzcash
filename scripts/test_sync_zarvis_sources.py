"""Privacy invariants for the committed external knowledge snapshot."""
import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-zarvis-sources.py")
spec = importlib.util.spec_from_file_location("sync_zarvis_sources", SCRIPT)
assert spec and spec.loader
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class ContactSanitizationTests(unittest.TestCase):
    def test_keeps_public_author_name_and_hashes_sanitized_text(self):
        contact = "owner" + "@" + "example.invalid"
        source = {"id": "test", "site": "example.invalid", "url": "https://example.invalid/post", "source": None,
                  "title": "Public article", "author": "Example Author", "marker": "sample",
                  "text": f"Example Author <{contact}> wrote the article.", "sha256": "old"}
        clean = sync.sanitize_record(source)
        self.assertIn("Example Author", clean["text"])
        self.assertNotIn(contact, clean["text"])
        self.assertEqual(clean["sha256"], sync.digest(clean["text"]))
        self.assertEqual(source["text"], f"Example Author <{contact}> wrote the article.")

    def test_committed_snapshot_has_no_contact_addresses_and_consistent_hashes(self):
        corpus = json.loads(sync.TARGET.read_text())
        self.assertIsNone(sync.EMAIL_ADDRESS.search(json.dumps(corpus)))
        for source in corpus["sources"]:
            self.assertEqual(source["sha256"], sync.digest(source["text"]))


if __name__ == "__main__":
    unittest.main()
