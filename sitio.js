/* Funciones compartidas por todas las páginas */
(function () {
  var TODOS = (window.PROYECTOS || []).filter(function (p) { return !p.oculto; });
  /* obras: todo lo que no está en la sección de textos */
  var P = TODOS.filter(function (p) { return p.seccion !== 'textos'; });
  var T = TODOS.filter(function (p) { return p.seccion === 'textos'; });

  function porSlug(slug) {
    for (var i = 0; i < P.length; i++) if (P[i].slug === slug) return i;
    return -1;
  }

  function vimeoPartes(codigo) {
    var partes = String(codigo).split('/');
    return { id: partes[0], hash: partes[1] || '' };
  }

  function vimeoEmbed(codigo, extra) {
    var v = vimeoPartes(codigo);
    var url = 'https://player.vimeo.com/video/' + v.id + '?' + (v.hash ? 'h=' + v.hash + '&' : '') +
      'title=0&byline=0&portrait=0&dnt=1' + (extra || '');
    var f = document.createElement('iframe');
    f.src = url;
    f.loading = 'lazy';
    f.allow = 'autoplay; fullscreen; picture-in-picture';
    f.allowFullscreen = true;
    f.title = 'video';
    return f;
  }

  var cacheMiniaturas = {};
  function vimeoMiniatura(codigo) {
    if (cacheMiniaturas[codigo]) return cacheMiniaturas[codigo];
    var v = vimeoPartes(codigo);
    var pagina = 'https://vimeo.com/' + v.id + (v.hash ? '/' + v.hash : '');
    cacheMiniaturas[codigo] = fetch('https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent(pagina))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.thumbnail_url ? d.thumbnail_url : null; })
      .catch(function () { return null; });
    return cacheMiniaturas[codigo];
  }

  /* imagen sin bordes blancos.
     recortes.js guarda, para cada imagen de Cargo, su tamaño y la caja sin blanco:
     [ancho, alto, izquierda, arriba, derecha, abajo] en píxeles.
     Si una imagen no tiene recorte, se muestra entera. */
  var R = window.RECORTES || {};
  var CARGO = 'https://payload.cargocollective.com';

  /* Las imágenes viven en la carpeta img, en dos tamaños livianos (webp):
       img/g/...  grande, hasta 2000 px, para ver las obras
       img/c/...  chica, hasta 800 px, para la portada, la bandeja y las miniaturas
     En data.js siguen escritas con su dirección de Cargo, que funciona como nombre:
     .../683453/<carpeta>/<archivo>.png  ->  img/g/<carpeta>/<archivo>.webp
     Si una imagen no está en la carpeta, se usa la de Cargo (o la original), así nada se rompe. */
  function local(src, tam) {
    tam = tam || 'g';
    if (src.indexOf(CARGO) === 0) {
      var p = src.slice(CARGO.length).split('/');
      return 'img/' + tam + '/' + p[4] + '/' + p[5].replace(/\.[^.]+$/, '') + '.webp';
    }
    var m = /^img\/([^\/]+)\/([^\/]+)$/.exec(src);       /* imágenes propias, como img/www/01.webp */
    if (m && tam === 'c') return 'img/c/' + m[1] + '/' + m[2];
    return src;
  }

  /* diferida = no empieza a cargar hasta que se le asigne img.src = img.dataset.src
     tam = 'g' (grande, por defecto) o 'c' (chica) */
  function imagen(src, alt, perezosa, diferida, recorte, tam) {
    var img = document.createElement('img');
    var archivo = local(src, tam);
    img.alt = alt || '';
    img.decoding = 'async';
    if (perezosa) img.loading = 'lazy';
    if (archivo !== src) img.addEventListener('error', function respaldo() {
      img.removeEventListener('error', respaldo);
      img.src = src;
    });
    if (diferida) img.dataset.src = archivo; else img.src = archivo;
    var c = recorte || R[src.replace(CARGO, '')];
    if (!c) { img.className = 'entera'; return img; }
    var w = c[0], h = c[1], l = c[2], t = c[3], r = c[4], b = c[5];
    var cw = r - l, ch = b - t;
    var caja = document.createElement('span');
    caja.className = 'recorte';
    caja.style.setProperty('--ar', (cw / ch).toFixed(5));
    img.style.width = (w / cw * 100) + '%';
    img.style.left = (-l / cw * 100) + '%';
    img.style.top = (-t / ch * 100) + '%';
    caja.appendChild(img);
    return caja;
  }

  /* imagen de tapa: la primera imagen, o la miniatura del primer video */
  function tapa(p, alt, perezosa, tam) {
    if (p.portada) return imagen(p.portada.src, alt, perezosa, false, p.portada.recorte, tam);
    if (p.imagenes.length) return imagen(p.imagenes[0], alt, perezosa, false, null, tam);
    var img = document.createElement('img');
    img.alt = alt || '';
    img.className = 'entera';
    if (p.videos.length) vimeoMiniatura(p.videos[0]).then(function (u) { if (u) img.src = u; });
    return img;
  }

  /* tapa que llena una celda de proporción A (ancho / alto), sin bordes blancos,
     centrada y recortada como "cover" */
  function tapaEnCelda(p, A) {
    var img = document.createElement('img');
    img.alt = p.titulo;
    img.decoding = 'async';
    if (!p.imagenes.length) {
      img.className = 'llena';
      if (p.videos.length) vimeoMiniatura(p.videos[0]).then(function (u) { if (u) img.src = u; });
      return img;
    }
    var src = p.imagenes[0];
    img.src = local(src, 'c');
    img.addEventListener('error', function respaldo() { img.removeEventListener('error', respaldo); img.src = src; });
    var c = R[src.replace(CARGO, '')];
    if (!c) { img.className = 'llena'; return img; }
    var w = c[0], l = c[2], t = c[3], cw = c[4] - c[2], ch = c[5] - c[3];
    img.className = 'ajustada';
    if (cw / ch > A) {          /* recorte más ancho que la celda: llena el alto */
      var sobra = cw - ch * A;
      var corrimiento = p.encuadre === 'izquierda' ? 0 : p.encuadre === 'derecha' ? sobra : sobra / 2;
      img.style.width = (w / (ch * A) * 100) + '%';
      img.style.left = (-(l + corrimiento) / (ch * A) * 100) + '%';
      img.style.top = (-t / ch * 100) + '%';
    } else {                    /* recorte más alto: llena el ancho */
      img.style.width = (w / cw * 100) + '%';
      img.style.left = (-l / cw * 100) + '%';
      img.style.top = (-(t + (ch - cw / A) / 2) * A / cw * 100) + '%';
    }
    return img;
  }

  /* desfase pseudoaleatorio pero fijo para cada proyecto (la costura) */
  function desfase(i) {
    var x = Math.sin((i + 1) * 12.9898) * 43758.5453;
    return Math.round(((x - Math.floor(x)) - 0.5) * 2 * 8);
  }

  function enlace(p) {
    if (p.seccion === 'textos') return 'textos.html#' + encodeURIComponent(p.slug);
    return 'proyecto.html?p=' + encodeURIComponent(p.slug);
  }

  function mezclar(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* mini tira: un segmento por proyecto */
  function miniTira(contenedor, actual, alHacerClic) {
    contenedor.innerHTML = '';
    P.forEach(function (p, i) {
      var a = document.createElement('a');
      a.href = enlace(p);
      a.title = p.titulo;
      a.setAttribute('aria-label', p.titulo);
      if (i === actual) { a.className = 'actual'; a.setAttribute('aria-current', 'page'); }
      if (alHacerClic) a.addEventListener('click', function (e) { alHacerClic(e, i); });
      contenedor.appendChild(a);
    });
    return contenedor.children;
  }

  window.Sitio = {
    P: P, T: T, TODOS: TODOS, porSlug: porSlug, mezclar: mezclar, R: R, vimeoEmbed: vimeoEmbed, vimeoMiniatura: vimeoMiniatura,
    imagen: imagen, local: local, tapa: tapa, tapaEnCelda: tapaEnCelda, desfase: desfase, enlace: enlace, miniTira: miniTira
  };
})();
