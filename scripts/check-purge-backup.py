"""Disposable filesystem-only safety tests; also run in the Linux worker image."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('purge', Path(__file__).with_name('purge-backup.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PurgeTest(unittest.TestCase):
    def test_fd_identity_and_links(self):
        with tempfile.TemporaryDirectory(prefix='axildb-purge-') as temp:
            root = Path(temp) / 'backups'
            root.mkdir()
            outside = Path(temp) / 'outside'
            outside.mkdir()
            keep = outside / 'keep'
            keep.write_text('keep')
            folder = root / 'manual-fixture'
            folder.mkdir()
            (folder / 'dump').write_bytes(b'x' * 65536)
            (folder / 'link').symlink_to(outside, target_is_directory=True)
            root_info, info = root.stat(), folder.stat()
            item = {'root': str(root), 'rootIdentity': [str(root_info.st_dev), str(root_info.st_ino)], 'name': folder.name, 'tomb': '.gc-fixture', 'identity': [str(info.st_dev), str(info.st_ino)]}
            with self.assertRaises(ValueError):
                module.purge({**item, 'name': '../outside'})
            with self.assertRaises(ValueError):
                module.purge({**item, 'rootIdentity': ['0', '0']})
            # A different inode at the same name is never purged.
            folder.rename(root / 'saved')
            folder.mkdir()
            (folder / 'replacement').write_text('keep')
            with self.assertRaises(ValueError):
                module.purge(item)
            self.assertTrue((folder / 'replacement').exists())
            (folder / 'replacement').unlink()
            folder.rmdir()
            # Resume a crash after quarantine rename.
            (root / 'saved').rename(root / '.gc-fixture')
            self.assertTrue(module.purge(item)['absent'])
            self.assertTrue(module.purge(item)['absent'])
            self.assertEqual(keep.read_text(), 'keep')
            # A root path replaced by a symlink fails closed.
            root.rename(Path(temp) / 'saved-root')
            root.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(OSError):
                module.purge(item)
            self.assertTrue(keep.exists())


if __name__ == '__main__':
    unittest.main()
