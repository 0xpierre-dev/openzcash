"""Regression checks for incomplete or changed reading-set imports."""
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from import_reading_set import REPO, digest, prepare


class ReadingSetImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.addCleanup(self.tmp.cleanup)
        self.data = copy.deepcopy(json.loads((REPO / 'src/lib/monthly/reading-sets.json').read_text())[0])
        self.review = {'status': 'approved', 'checks': dict.fromkeys(
            ('sourceReconciliation', 'visualReview', 'publicLinks'), True), 'documents': {}}
        for kind, doc in self.data['documents'].items():
            for field, suffix in [('pdf', '.pdf'), ('manifest', '.json')]:
                target = self.root / (kind + suffix)
                shutil.copyfile(REPO / 'public' / doc[field].lstrip('/'), target)
                doc[field] = target.name
            self.review['documents'][kind] = {
                'sha256': digest(self.root / doc['pdf']),
                'manifestSha256': digest(self.root / doc['manifest']),
                'reviewedPages': list(range(1, doc['pageCount'] + 1)),
            }
        self.save()

    def save(self):
        source = self.root / 'reading-set.json'
        source.write_text(json.dumps(self.data))
        self.review['inputSha256'] = digest(source)
        (self.root / 'review.json').write_text(json.dumps(self.review))

    def test_both_complete_documents_prepare(self):
        data, docs = prepare(self.root)
        self.assertEqual(len(docs), 2)
        self.assertEqual(data['documents']['monthly']['pageCount'], 10)

    def test_changed_source_data_invalidates_review(self):
        self.data['requests'][0]['amount'] = 1
        (self.root / 'reading-set.json').write_text(json.dumps(self.data))
        with self.assertRaisesRegex(ValueError, 'matching completed review'):
            prepare(self.root)

    def test_changed_pdf_invalidates_review(self):
        with (self.root / 'operations.pdf').open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'changed after review'):
            prepare(self.root)

    def test_missing_publication_is_rejected(self):
        del self.data['documents']['operations']
        self.save()
        with self.assertRaisesRegex(ValueError, 'together'):
            prepare(self.root)

    def test_preview_link_cannot_ship(self):
        manifest = self.root / 'monthly.json'
        pages = json.loads(manifest.read_text())
        pages[9]['links'][0]['url'] = 'http://127.0.0.1:4193/monthly-preview?publication=operations#1'
        manifest.write_text(json.dumps(pages))
        self.review['documents']['monthly']['manifestSha256'] = digest(manifest)
        self.save()
        with self.assertRaisesRegex(ValueError, 'non-public link'):
            prepare(self.root)


if __name__ == '__main__':
    unittest.main()
