"""Version browser assets and rebuild the downloadable GitHub Pages source."""
from pathlib import Path
import base64
import hashlib
import io
import re
import zipfile

root = Path(__file__).resolve().parents[1]
def version(name):
    return hashlib.sha256((root / name).read_bytes()).hexdigest()[:12]
def save(name, text):
    path = root / name
    if path.read_text() != text:
        path.write_text(text)
def asset(text, name, value):
    return re.sub(re.escape(name) + r'(?:\?v=[a-f0-9]+)?(?=[\x22\x27])', name + '?v=' + value, text)

# Version the imported module as well as the top-level module.
save('app.js', asset((root / 'app.js').read_text(), 'privacy.js', version('privacy.js')))
index = (root / 'index.html').read_text()
for name in ['style.css', 'firebase-config.js', 'app.js']:
    index = asset(index, name, version(name))
save('index.html', index)

files = [
    '.gitignore', '.nojekyll', 'README.md', 'app.js', 'firebase-config.js',
    'firebase.json', 'firestore.rules', 'index.html', 'package.json', 'privacy.js',
    'style.css', 'tests/privacy.test.mjs', 'tests/privacy-rules.test.mjs',
    'scripts/package-site.py'
]
package = io.BytesIO()
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (root / name).read_bytes())
    placeholder = zipfile.ZipInfo('download.html', (2026, 1, 1, 0, 0, 0))
    placeholder.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(placeholder, '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Retro</title><p>Este diretório já contém o código completo.</p><a href="index.html">Voltar ao quadro</a></html>')
(root / 'retro-github-pages.zip').write_bytes(package.getvalue())
encoded = base64.b64encode(package.getvalue()).decode()
download = re.sub(r'const zipData="[^"]+";', lambda m: 'const zipData="' + encoded + '";', (root / 'download.js').read_text(), count=1)
save('download.js', download)
page = (root / 'download.html').read_text()
for name in ['style.css', 'download.js']:
    page = asset(page, name, version(name))
save('download.html', page)
print('Browser assets versioned and download package refreshed.')
