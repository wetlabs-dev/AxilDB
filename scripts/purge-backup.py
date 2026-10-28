"""Remove one explicitly authorized inode, using an fd-relative quarantine.
No traversal of links or mounts; no age-based retention. JSON metadata only.
"""
import json
import os
import re
import stat
import sys


def purge(item):
    name, tomb = item['name'], item['tomb']
    if not re.fullmatch(r'(?:axildb|manual|deploy)-[A-Za-z0-9_-]+', name) or not re.fullmatch(r'\.gc-[A-Za-z0-9_-]+', tomb):
        raise ValueError('Invalid managed artifact identity')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(item['root'], flags)
    try:
        root = os.fstat(fd)
        if [str(root.st_dev), str(root.st_ino)] != item['rootIdentity']:
            raise ValueError('Backup root identity changed')
        # Resume an interrupted removal only at its durable quarantine identity.
        try:
            info = os.stat(tomb, dir_fd=fd, follow_symlinks=False)
        except FileNotFoundError:
            try:
                info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                return {'absent': True}
            if not stat.S_ISDIR(info.st_mode) or [str(info.st_dev), str(info.st_ino)] != item['identity']:
                raise ValueError('Backup identity changed; manual review required')
            os.rename(name, tomb, src_dir_fd=fd, dst_dir_fd=fd)
            info = os.stat(tomb, dir_fd=fd, follow_symlinks=False)
        if not stat.S_ISDIR(info.st_mode) or [str(info.st_dev), str(info.st_ino)] != item['identity']:
            raise ValueError('Quarantine identity changed; nothing purged')
        # Keep every traversal anchored to the inode we opened, not a mutable path.
        # A replaced directory entry can never redirect recursion into its replacement.
        def walk(directory, remove=False):
            with os.scandir(directory) as entries:
                for entry in entries:
                    child = entry.stat(follow_symlinks=False)
                    if child.st_dev != info.st_dev:
                        raise ValueError('Nested filesystem requires manual review')
                    if stat.S_ISDIR(child.st_mode):
                        nested = os.open(entry.name, flags, dir_fd=directory)
                        try:
                            opened = os.fstat(nested)
                            if (opened.st_dev, opened.st_ino) != (child.st_dev, child.st_ino):
                                raise ValueError('Directory changed during validation')
                            walk(nested, remove)
                            if remove:
                                now = os.stat(entry.name, dir_fd=directory, follow_symlinks=False)
                                if (now.st_dev, now.st_ino) != (opened.st_dev, opened.st_ino):
                                    raise ValueError('Directory identity changed; retain replacement')
                                os.rmdir(entry.name, dir_fd=directory)
                        finally:
                            os.close(nested)
                    elif remove:
                        os.unlink(entry.name, dir_fd=directory)
        directory = os.open(tomb, flags, dir_fd=fd)
        try:
            opened = os.fstat(directory)
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise ValueError('Quarantine changed during validation')
            if sys.platform == 'linux':
                with open('/proc/self/mountinfo') as mounts:
                    full = os.path.join(item['root'], tomb)
                    for line in mounts:
                        mounted = re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), line.split(' ')[4])
                        if mounted == full or mounted.startswith(full + '/'):
                            raise ValueError('Nested mount point requires manual review')
            walk(directory)  # Validate device boundaries before unlinking any content.
            walk(directory, True)
            now = os.stat(tomb, dir_fd=fd, follow_symlinks=False)
            if (now.st_dev, now.st_ino) != (opened.st_dev, opened.st_ino):
                raise ValueError('Quarantine identity changed; retain replacement')
            os.rmdir(tomb, dir_fd=fd)
        finally:
            os.close(directory)
        try:
            os.stat(tomb, dir_fd=fd, follow_symlinks=False)
            raise ValueError('Artifact still present')
        except FileNotFoundError:
            pass
        return {'absent': True}
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        print(json.dumps(purge(json.loads(sys.argv[1]))))
    except Exception as error:
        print(json.dumps({'error': type(error).__name__, 'code': getattr(error, 'errno', None), 'message': str(error)}))
        sys.exit(1)
