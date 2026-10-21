// The game asks for its two big files by name (index.wasm, index.pck). They are served from this site's own data folder (see worker/index.ts).
(function () {
  var R = { 'index.wasm': './data/engine.wasm', 'index.pck': './data/data.pck' };
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var name = url.split('?')[0].split('/').pop();
    return R[name] ? nativeFetch(R[name], init) : nativeFetch(input, init);
  };
})();
