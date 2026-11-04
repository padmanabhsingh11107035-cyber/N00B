import os, shutil, gzip
OUT = 'D:/noob-aether/out'
s = open(OUT + '/index.js', encoding='utf8').read()
a = "loadPromise = preloader.loadPromise(`${loadPath}.wasm`, size, true);"
b = "} else if (path.endsWith('.wasm')) {\n\t\t\t\t\treturn `${loadPath}.wasm`;"
assert a in s and b in s
s = s.replace(a, "loadPromise = preloader.loadPromise(`${loadPath}.wasm.gz`, size, true);")
s = s.replace(b, "} else if (path.endsWith('.wasm')) {\n\t\t\t\t\treturn `${loadPath}.wasm.gz`;")
c = "return fetch(file).then(function (response) {\n\t\t\tif (!response.ok) {"
assert c in s
s = s.replace(c, """return fetchPlain(file).then(function (response) {
			if (!response.ok) {""")
d = "\tfunction loadFetch(file, tracker, fileSize, raw) {"
assert d in s
s = s.replace(d, """\t// The game's engine file is stored gzipped (the host accepts files up to 25 MB): give the loader the plain wasm, whether or not the browser already unzipped it.
\tfunction fetchPlain(file) {
\t\treturn fetch(file).then(function (r) {
\t\t\tif (!/\\.wasm\\.gz$/.test(file) || !r.ok || !r.body) { return r; }
\t\t\tconst headers = { 'Content-Type': 'application/wasm' };
\t\t\tif ((r.headers.get('content-encoding') || '').indexOf('gzip') >= 0) { return new Response(r.body, { status: 200, headers: headers }); }
\t\t\treturn new Response(r.body.pipeThrough(new DecompressionStream('gzip')), { status: 200, headers: headers });
\t\t});
\t}

""" + d)
open(OUT + '/index.js', 'w', encoding='utf8').write(s)
with open(OUT + '/index.wasm', 'rb') as f, gzip.open(OUT + '/index.wasm.gz', 'wb', 9) as g:
    shutil.copyfileobj(f, g)
os.remove(OUT + '/index.wasm')
print(sorted((f, os.path.getsize(OUT + '/' + f) // 1000) for f in os.listdir(OUT)))
