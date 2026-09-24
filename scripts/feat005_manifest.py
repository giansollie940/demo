"""Compare working source with supplied archive; write review evidence only."""
from pathlib import Path
from zipfile import ZipFile
import hashlib, difflib, json, re
root=Path(__file__).resolve().parents[1]
archive=root.parent/'BUG-002-BANNER-REVIEW-V2.zip'
out=root/'docs/feat-005'
excluded={'node_modules','dist','.git'}
def include(name):
    p=Path(name)
    return not excluded.intersection(p.parts) and not name.startswith('docs/feat-005/') and not name.endswith(('.tsbuildinfo','.log'))
with ZipFile(archive) as z:
    baseline={n.removeprefix('tu-hoc-bug-002/'):z.read(n) for n in z.namelist() if n.startswith('tu-hoc-bug-002/') and not n.endswith('/') and include(n.removeprefix('tu-hoc-bug-002/'))}
current={}
def walk(folder):
    for p in folder.iterdir():
        name=p.relative_to(root).as_posix()
        if not include(name): continue
        if p.is_dir(): walk(p)
        else: current[name]=p.read_bytes()
walk(root)
changes=[];patch=[]
for name in sorted(baseline.keys()|current.keys()):
    old,new=baseline.get(name),current.get(name)
    if old==new: continue
    changes.append({'path':name,'change':'created' if old is None else 'deleted' if new is None else 'modified','before_sha256':hashlib.sha256(old).hexdigest() if old is not None else None,'after_sha256':hashlib.sha256(new).hexdigest() if new is not None else None})
    try:
        a=(old or b'').decode('utf-8-sig').splitlines(keepends=True);b=(new or b'').decode('utf-8-sig').splitlines(keepends=True)
        patch.extend(difflib.unified_diff(a,b,fromfile='a/'+name if old is not None else '/dev/null',tofile='b/'+name if new is not None else '/dev/null'))
    except UnicodeDecodeError: patch.append('Binary files differ: '+name+'\n')
(out/'FILES_CHANGED.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'SOURCE_CHANGES.patch').write_text(''.join(patch),encoding='utf-8')
specs={name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in ['FINAL_SPEC_SYSTEM_ACTOR_RESOLVED.md','DECISIONS_UPDATE_SYSTEM_ACTOR_RESOLVED.md']}
(out/'evidence/source-integrity.json').write_text(json.dumps({'baseline_archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'specification_sha256':specs,'changes':len(changes),'notes':['No baseline Git commits exist; diff is against supplied archive.','Build output dist, node_modules, caches and FEAT-005 documentation are excluded from source diff.','Original documents and archive are retained untouched.']},indent=2),encoding='utf-8')
results=[]
for name in ['database','legacy-database','feat004-database','static','ui','typecheck','build']:
    log=(out/'evidence'/f'{name}.log').read_text(encoding='utf-8')
    code=int(re.search(r'Exit code: (\d+)\s*$',log).group(1))
    results.append({'name':name,'started':re.search(r'^Started: (.+)$',log,re.M).group(1),'exitCode':code,'status':'PASS' if code==0 else 'FAIL'})
(out/'evidence/verification-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'changes':len(changes),'created':sum(c['change']=='created' for c in changes),'modified':sum(c['change']=='modified' for c in changes),'deleted':sum(c['change']=='deleted' for c in changes)},indent=2))
