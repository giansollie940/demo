#!/usr/bin/env python3
"""Build and verify a flat, source-only release ZIP with a byte-level manifest."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'SOURCE_MANIFEST.json'
LEGACY_SUMS = 'SHA256SUMS.txt'
EXCLUDED_DIRS = {'node_modules', 'dist', '.git', '__pycache__'}
GENERATED_TEST_HISTORY = {'previous-1790141727599', 'previous-1790141938561'}


def source_files():
    for path in sorted(ROOT.rglob('*')):
        if any(part in EXCLUDED_DIRS or part in GENERATED_TEST_HISTORY for part in path.relative_to(ROOT).parts):
            continue
        if path.is_symlink():
            continue
        if path.is_file() and path.name not in {MANIFEST, LEGACY_SUMS} and not path.name.endswith(('.tsbuildinfo', '.zip')):
            yield path


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def legacy_sums(files: dict[str, bytes]) -> bytes:
    """Keep the legacy checksum list consistent with all other packaged sources."""
    return ''.join(f'{digest(data)}  {path}\n' for path, data in sorted(files.items())).encode()


def validate(z: ZipFile):
    names = z.namelist()
    if len(names) != len(set(names)):
        raise ValueError('duplicate ZIP entry')
    if MANIFEST not in names or 'package.json' not in names:
        raise ValueError('missing root manifest or package.json')
    manifest = json.loads(z.read(MANIFEST))
    entries = manifest['files']
    paths = [entry['path'] for entry in entries]
    if names != sorted(paths + [MANIFEST]):
        raise ValueError('manifest and ZIP entry list differ')
    for entry in entries:
        path = entry['path']
        if path.startswith('/') or '..' in Path(path).parts or '\\' in path:
            raise ValueError(f'unsafe entry: {path}')
        data = z.read(path)
        if len(data) != entry['bytes'] or digest(data) != entry['sha256']:
            raise ValueError(f'byte mismatch: {path}')
    if LEGACY_SUMS not in paths:
        raise ValueError('missing legacy SHA256SUMS.txt')
    non_manifest_files = {path: z.read(path) for path in paths if path != LEGACY_SUMS}
    if z.read(LEGACY_SUMS) != legacy_sums(non_manifest_files):
        raise ValueError('legacy SHA256SUMS.txt does not match packaged sources')
    for required in (
        'database/upgrade/15-VERIFY-002-DEVICE-POLICY-REALTIME.sql',
        'database/upgrade/16-VERIFY-002-DEVICE-SLOT-KEY-SEARCH-PATH.sql',
        'src/components/owl/OwlMascotV2.vue',
        'src/components/admin/AdminStorageHealth.vue',
        'tests/feat-008/dashboard.test.ts',
        'docs/feat-next/IMPLEMENTATION_HANDOFF.md',
    ):
        if required not in paths:
            raise ValueError(f'missing required source: {required}')
    return len(entries)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify-zip', type=Path)
    args = parser.parse_args()
    if bool(args.output) == bool(args.verify_zip):
        parser.error('select exactly one of --output or --verify-zip')
    if args.verify_zip:
        with ZipFile(args.verify_zip) as archive:
            count = validate(archive)
        print(f'PASS: {count} source files; flat root; each SHA-256 verified')
        return
    files = {p.relative_to(ROOT).as_posix(): p.read_bytes() for p in source_files()}
    files[LEGACY_SUMS] = legacy_sums(files)
    (ROOT / LEGACY_SUMS).write_bytes(files[LEGACY_SUMS])
    manifest = {
        'format': 'so-tu-hoc-source-manifest-v1',
        'entry_root': 'archive root',
        'excluded_generated': ['node_modules', 'dist', '.git', '__pycache__', *sorted(GENERATED_TEST_HISTORY), '*.tsbuildinfo', '*.zip'],
        'files': [{'path': path, 'bytes': len(data), 'sha256': digest(data)} for path, data in files.items()],
    }
    contents = {**files, MANIFEST: (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')}
    (ROOT / MANIFEST).write_bytes(contents[MANIFEST])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.output, 'w', compression=ZIP_DEFLATED, compresslevel=7) as archive:
        for path, data in sorted(contents.items()):
            info = ZipInfo(path, date_time=(2026, 9, 23, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=7)
    with ZipFile(args.output) as archive:
        count = validate(archive)
    print(f'PASS: built and verified {count} source files at {args.output}')


if __name__ == '__main__':
    main()
