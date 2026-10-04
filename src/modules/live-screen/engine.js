/* eslint-disable */
// @ts-nocheck
/*
 * Enjoy Screen: motor del kit de Enjoy («enjoy-screen-ui-kit.html»), VERBATIM salvo:
 *  - ASSETS/DEMO opcionales (los pone client.ts antes de cargar este fichero, con los assets del espacio);
 *  - la rotación del reclamo se limpia en destroy (varias pantallas por página).
 */
/* ==========================================================================
   6. EL MOTOR
   --------------------------------------------------------------------------
   EnjoyScreen(elemento, opciones) → { show, set, auto, destroy }
   Monta una pantalla dentro de `elemento`. Puedes montar todas las que
   quieras, cada una en su estado: es la forma de llenar una cuadrícula del
   dossier con cuatro pantallas distintas a la vez.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.ASSETS || {}, D = window.DEMO || {};

  /* --- QR de atrezzo -----------------------------------------------------
     Dibuja algo con pinta de QR para que la maqueta se lea. NO ESCANEA.
     Pon un PNG real en ASSETS.qrImage antes de enviar el dossier. */
  var qrCache = null;
  function qrSrc() {
    if (A.qrImage) return A.qrImage;
    if (qrCache) return qrCache;
    var N = 25, px = 12, c = document.createElement('canvas');
    c.width = c.height = N * px;
    var g = c.getContext('2d'), seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var inEye = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
      if (!inEye && rnd() > 0.52) g.fillRect(x * px, y * px, px, px);
    }
    [[0, 0], [N - 7, 0], [0, N - 7]].forEach(function (p) {
      g.fillStyle = '#000'; g.fillRect(p[0] * px, p[1] * px, 7 * px, 7 * px);
      g.fillStyle = '#fff'; g.fillRect((p[0] + 1) * px, (p[1] + 1) * px, 5 * px, 5 * px);
      g.fillStyle = '#000'; g.fillRect((p[0] + 2) * px, (p[1] + 2) * px, 3 * px, 3 * px);
    });
    // Hueco blanco central: en el producto ahí va el logo de Enjoy.
    g.fillStyle = '#fff'; g.fillRect(9 * px, 9 * px, 7 * px, 7 * px);
    g.fillStyle = '#ff27bb'; g.beginPath();
    g.arc(12.5 * px, 12.5 * px, 2.2 * px, 0, Math.PI * 2); g.fill();
    qrCache = c.toDataURL('image/png');
    return qrCache;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pick(arr, i) { return arr && arr.length ? arr[i % arr.length] : null; }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '')[0] || '' + ((p[1] || '')[0] || '')).toUpperCase() ||
           ((p[0] || '')[0] || '·').toUpperCase();
  }

  /* --- Tramos de pago ----------------------------------------------------
     El importe cambia el tratamiento Y el tiempo en pantalla. Es la palanca
     de monetización: pagar más = salir más grande y más rato. */
  function tierOf(amount) {
    if (amount >= 100) return 'platinum';
    if (amount >= 50)  return 'premium';
    if (amount >= 20)  return 'highlight';
    return 'none';
  }
  function tierSeconds(base, tier) {
    return Math.min(90, base + (tier === 'platinum' ? 60 : tier === 'premium' ? 30 : 0));
  }
  function euro(n) { return (Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')) + ' €'; }

  /* --- Las 9 celdas de colocación ---------------------------------------
     Todo lo que flota (tarjeta del QR, petición compacta, aviso de precio)
     se ancla a la misma celda. El local la elige una vez y manda en todo. */
  var POSITIONS = ['top-left','top-center','top-right','mid-left','center','mid-right','bottom-left','bottom-center','bottom-right'];
  function posStyle(pos, margin) {
    var m = margin || '1.8cqw';
    return ({
      'top-left':      'top:'+m+';left:'+m+';',
      'top-center':    'top:'+m+';left:50%;transform:translateX(-50%);',
      'top-right':     'top:'+m+';right:'+m+';',
      'mid-left':      'top:50%;left:'+m+';transform:translateY(-50%);',
      'center':        'top:50%;left:50%;transform:translate(-50%,-50%);',
      'mid-right':     'top:50%;right:'+m+';transform:translateY(-50%);',
      'bottom-left':   'bottom:'+m+';left:'+m+';',
      'bottom-center': 'bottom:'+m+';left:50%;transform:translateX(-50%);',
      'bottom-right':  'bottom:'+m+';right:'+m+';'
    })[pos] || 'bottom:'+m+';right:'+m+';';
  }
  function pricePosStyle(pos) {
    var m = '1.4cqw', clear = '15cqh', away = 'calc(' + m + ' + ' + clear + ')';
    return ({
      'top-left':      'top:'+away+';left:'+m+';',
      'top-center':    'top:'+away+';left:50%;transform:translateX(-50%);',
      'top-right':     'top:'+away+';right:'+m+';',
      'mid-left':      'top:calc(50% - '+clear+');left:'+m+';transform:translateY(-50%);',
      'center':        'top:calc(50% - '+clear+');left:50%;transform:translate(-50%,-50%);',
      'mid-right':     'top:calc(50% - '+clear+');right:'+m+';transform:translateY(-50%);',
      'bottom-left':   'bottom:'+away+';left:'+m+';',
      'bottom-center': 'bottom:'+away+';left:50%;transform:translateX(-50%);',
      'bottom-right':  'bottom:'+away+';right:'+m+';'
    })[pos] || 'bottom:'+away+';right:'+m+';';
  }

  /* --- Trozos de interfaz reutilizables ---------------------------------- */
  function imgOr(src, cls, label) {
    return src
      ? '<img class="' + cls + '" src="' + esc(src) + '" alt="">'
      : '<div class="' + cls + ' es-ph">' + esc(label || '') + '</div>';
  }
  function qrTag(cls) { return '<img class="' + cls + '" src="' + qrSrc() + '" alt="QR">'; }

  function topBar(o, minimal) {
    if (minimal) return '<div class="es-topbar"><span></span>' + djBadge(o) + '<span></span></div>';
    var left = A.venueLogo
      ? '<img class="es-venue-logo" src="' + esc(A.venueLogo) + '" alt="' + esc(A.venueName) + '">'
      : '<span class="es-venue">' + esc(A.venueName) + '</span>';
    var right = A.showEnjoyLogo ? '<span class="es-brand">enjoy the club</span>' : '<span></span>';
    return '<div class="es-topbar">' + left + djBadge(o) + right + '</div>';
  }
  function djBadge() {
    if (!A.djName) return '<span></span>';
    return '<span class="es-dj"><span class="es-dj-dot"></span><span class="es-dj-stack">' +
           '<span class="es-dj-tag">EN VIVO · DJ</span>' +
           '<span class="es-dj-name">' + esc(A.djName) + '</span></span></span>';
  }
  function userBadge(name, avatar, over) {
    var anon = !name;
    var av = avatar
      ? '<img src="' + esc(avatar) + '" alt="">'
      : (anon ? '🕶' : esc(initials(name)));
    return '<span class="es-badge' + (over ? ' over' : '') + '">' +
           '<span class="es-badge-av">' + av + '</span>' +
           '<span class="es-badge-name">' + esc(anon ? 'ANÓNIMO' : name) + '</span></span>';
  }
  function amountChip(amount) {
    return amount > 0 ? '<span class="es-amount">' + euro(amount) + '</span>' : '';
  }

  /* ======================================================================
     ESTADOS DE LA PANTALLA
     Cada función devuelve el HTML de un estado completo.
     ====================================================================== */

  /* IDLE CLUB — la pantalla el 90% de la noche. Reclamo a pantalla completa. */
  var CTAS = [
    { es: 'Pide tu canción',   en: 'Request your song' },
    { es: 'Sube tu foto',      en: 'Upload your photo' },
    { es: 'Deja tu dedicatoria', en: 'Send a message' }
  ];
  function sceneClubIdle(o) {
    var c = CTAS[o._cta % CTAS.length];
    return topBar(o) +
      '<div class="es-idle">' +
        '<div class="es-cta"><h1 class="es-cta-title">' + c.es + '</h1>' +
        '<p class="es-cta-sub">' + c.en + '</p></div>' +
        '<div class="es-qr-box">' + qrTag('') + '</div>' +
        (o.free ? '<span class="es-free">GRATIS</span>' : '') +
      '</div>';
  }

  /* IDLE TRANSPARENTE — el QR se encoge a tarjeta y se coloca donde quieras.
     Puede salir siempre o asomar cada X minutos (cadencia). */
  function sceneTpIdle(o) {
    var c = CTAS[o._cta % CTAS.length];
    return topBar(o, true) +
      '<div class="es-qr-card' + (o._qrHidden ? ' hidden' : '') + '" style="' + posStyle(o.position) + '">' +
        '<div class="es-qr-card-text">' +
          '<span class="es-qr-card-title">' + c.es + '</span>' +
          '<span class="es-qr-card-sub">' + c.en + '</span>' +
          (o.free ? '<span class="es-free" style="margin-top:.5cqw">GRATIS</span>' : '') +
        '</div>' +
        '<span class="es-qr-card-arrow"><svg viewBox="0 0 24 24" width="100%" height="100%">' +
          '<path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        '<div class="es-qr-card-box">' + qrTag('') + '</div>' +
      '</div>';
  }

  /* PETICIÓN A PANTALLA COMPLETA — canción con carátula, o foto de cliente.
     Mismo esqueleto para las dos; cambia el encaje de la imagen. */
  function sceneFull(o, kind, data) {
    var tier = tierOf(data.amount || 0);
    var isPhoto = kind === 'photo';
    var img = isPhoto ? pick(A.photos, o._i) : pick(A.covers, o._i);
    var label = isPhoto ? 'Foto del cliente' : 'Carátula';
    var qrLabel = isPhoto ? 'SUBE LA TUYA' : (kind === 'song' ? 'PIDE LA TUYA' : 'SUBE EL TUYO');

    var body = '<div class="es-np-bottom">';
    if (kind === 'song') {
      body += '<div><p class="es-song-name">' + esc(data.song) + '</p>' +
              (data.artist ? '<p class="es-song-artist">' + esc(data.artist) + '</p>' : '') + '</div>';
    }
    body += userBadge(data.by, pick(A.avatars, o._i), true);
    if (data.dedication) body += '<span class="es-sep"></span><p class="es-np-text">' + esc(data.dedication) + '</p>';
    body += amountChip(data.amount || 0) + '</div>';

    return '<div class="es-np tier-' + tier + (o.fx ? ' fx' : '') + '">' +
      (img
        ? '<img class="es-np-img' + (isPhoto ? ' is-photo' : '') + '" src="' + esc(img) + '" alt="">'
        : '<div class="es-np-img es-ph">' + label + '</div>') +
      '<div class="es-np-scrim"></div>' +
      topBar(o) + body +
      '<div class="es-qr-mini"><span class="es-qr-label pink">' + qrLabel + '</span>' +
        '<div class="es-qr-mini-card">' + qrTag('') + '</div></div>' +
      '<div class="es-timebar"><span style="animation-duration:' + tierSeconds(30, tier) + 's"></span></div>' +
    '</div>';
  }

  /* DEDICATORIA SIN IMAGEN — tarjeta centrada sobre el fondo con brillos. */
  function sceneMessage(o, data) {
    var tier = tierOf(data.amount || 0);
    return '<div class="es-np es-np-nocover tier-' + tier + (o.fx ? ' fx' : '') + '">' +
      (o.fx ? '<div class="es-np-glow"><span class="g1"></span><span class="g2"></span></div>' : '') +
      topBar(o) +
      '<div class="es-msg-card">' +
        userBadge(data.by, pick(A.avatars, o._i)) +
        '<p class="es-msg-text">' + esc(data.dedication) + '</p>' +
        amountChip(data.amount || 0) +
      '</div>' +
      '<div class="es-qr-mini"><span class="es-qr-label">SUBE EL TUYO</span>' +
        '<div class="es-qr-mini-card">' + qrTag('') + '</div></div>' +
      '<div class="es-timebar"><span style="animation-duration:' + tierSeconds(30, tier) + 's"></span></div>' +
    '</div>';
  }

  /* PETICIÓN COMPACTA — la misma información, pequeña y colocable.
     · toast → canción suelta: mini carátula + quién la pide.
     · card  → dedicatoria / foto: carátula mediana + mensaje.
     · platinum → trato aparte: foto de perfil redonda y nombre enorme. */
  function sceneCompact(o, kind, data, variant, forcePos, wide) {
    // `forcePos` lo usa el toast de Club, que va SIEMPRE abajo al centro y más
    // ancho: la rejilla de 9 posiciones es solo del modo transparente.
    var tier = tierOf(data.amount || 0);
    var isPhoto = kind === 'photo';
    var img = isPhoto ? pick(A.photos, o._i) : pick(A.covers, o._i);
    var inner;

    if (tier === 'platinum') {
      var av = pick(A.avatars, o._i);
      inner = '<div class="es-plat-avatar">' +
          (av ? '<img src="' + esc(av) + '" alt="">' : '<span style="font-size:2.4cqw;font-weight:700">' + esc(initials(data.by)) + '</span>') +
        '</div><div class="es-npc-body">' +
          '<span class="es-plat-name">' + esc(data.by || 'Anónimo') + '</span>' +
          (data.song ? '<p class="es-npc-song" style="font-size:1.1cqw;color:var(--es-color-text-muted)">' + esc(data.song) + ' · ' + esc(data.artist || '') + '</p>' : '') +
          (data.dedication ? '<p class="es-npc-ded">' + esc(data.dedication) + '</p>' : '') +
          amountChip(data.amount) +
        '</div>';
    } else if (variant === 'toast') {
      inner = imgOr(img, 'es-npc-thumb', '♪') +
        '<div class="es-npc-body">' +
          '<p class="es-npc-song">' + esc(data.song) + '<span class="es-npc-artist">· ' + esc(data.artist || '') + '</span></p>' +
          '<p class="es-npc-req">pedida por ' + esc(data.by || 'Anónimo') + (data.others ? ' +' + data.others : '') + '</p>' +
          amountChip(data.amount || 0) +
        '</div>';
    } else {
      inner = (img || isPhoto
          ? imgOr(img, 'es-npc-cover' + (isPhoto ? ' photo' : (o.showCover ? '' : ' sm')), isPhoto ? 'Foto' : 'Carátula')
          : '') +
        '<div class="es-npc-body">' +
          (kind === 'song' ? '<p class="es-npc-song">' + esc(data.song) + '<span class="es-npc-artist">· ' + esc(data.artist || '') + '</span></p>' : '') +
          userBadge(data.by, pick(A.avatars, o._i)) +
          (data.dedication ? '<p class="es-npc-ded">' + esc(data.dedication) + '</p>' : '') +
          amountChip(data.amount || 0) +
        '</div>';
    }

    return '<div class="es-npc ' + variant + (wide ? ' wide' : '') + ' tier-' + tier + (o.fx ? ' fx' : '') +
      '" style="' + posStyle(forcePos || o.position) + '">' +
      inner +
      '<div class="es-npc-bar"><span style="animation-duration:' + tierSeconds(30, tier) + 's"></span></div>' +
    '</div>';
  }

  /* ======================================================================
     CAPAS QUE CONVIVEN CON CUALQUIER ESTADO
     ====================================================================== */

  /* Lateral "Más pedidas": entra sola, enseña el ranking 8s y se va.
     Vive fuera del re-render para que la transición de entrada se vea. */
  function rankingHTML() {
    var items = D.ranking.slice(0, 6);
    var max = Math.max.apply(null, items.map(function (i) { return i.votes; }).concat([1]));
    return '<div class="es-rank-head"><span style="font-size:1.8cqw">🔥</span><h4>Más pedidas</h4></div>' +
      '<p class="es-rank-sub">Vota escaneando el QR</p><div class="es-rank-list">' +
      items.map(function (it, i) {
        var cover = pick(A.covers, i);
        return '<div class="es-rank-card' + (i === 0 ? ' top' : '') + '" style="--d:' + (0.05 + i * 0.05) + 's">' +
          '<span class="es-rank-num">' + (i + 1) + '</span>' +
          (cover ? '<img class="es-rank-cover" src="' + esc(cover) + '" alt="">' : '<span class="es-rank-cover"></span>') +
          '<div class="es-rank-info"><span class="es-rank-song">' + esc(it.song) + '</span>' +
            '<span class="es-rank-artist">' + esc(it.artist) + '</span>' +
            '<div class="es-rank-bar"><div class="es-rank-fill" style="--w:' + ((it.votes / max) * 100) + '%"></div></div></div>' +
          '<span class="es-rank-votes">' + it.votes + '</span></div>';
      }).join('') + '</div>';
  }

  /* Aviso de petición nueva: salta cada vez que alguien pide algo. */
  function toastHTML(i) {
    var it = D.ranking[i % D.ranking.length], cover = pick(A.covers, i);
    return '<div class="es-toast">' +
      (cover ? '<img class="es-toast-thumb" src="' + esc(cover) + '" alt="">' : '<span class="es-toast-thumb"></span>') +
      '<div class="es-toast-body">' +
        '<p class="es-toast-title">' + esc(it.song) + ' <span>— ' + esc(it.artist) + '</span></p>' +
        '<p class="es-toast-cta">🔥 Ya tiene ' + it.votes + ' votos · ¿La quieres? Escanea y vota</p>' +
      '</div><div class="es-toast-bar"><span style="animation-duration:5s"></span></div></div>';
  }

  /* Aviso de precio: lo dispara el propio sistema al cambiar la tarifa. */
  function priceHTML(o, text, kind) {
    var positioned = o.mode === 'tp';
    return '<div class="es-price ' + (kind === 'down' ? 'down ' : '') +
      (positioned ? 'positioned" style="' + pricePosStyle(o.position) : 'top') + '">' + esc(text) + '</div>';
  }

  /* ======================================================================
     MONTAJE
     ====================================================================== */
  var SCENES = {
    'club.idle':    function (o) { return sceneClubIdle(o); },
    'club.song':    function (o) { return sceneFull(o, 'song',  o._data); },
    'club.photo':   function (o) { return sceneFull(o, 'photo', o._data); },
    'club.message': function (o) { return sceneMessage(o, o._data); },
    // El local escribe a su pantalla desde su móvil (promoción, aviso): mismo formato, firmado por el local.
    'club.promo':   function (o) { return sceneMessage(o, o._data); },
    // Carátulas apagadas: la base idle NO se va, la canción asoma en pequeño.
    'club.toast':   function (o) { return sceneClubIdle(o) + sceneCompact(o, 'song', o._data, 'toast', 'bottom-center', true); },
    'tp.idle':      function (o) { return sceneTpIdle(o); },
    'tp.song':      function (o) { return sceneCompact(o, 'song',  o._data, o._data.dedication ? 'card' : 'toast'); },
    'tp.photo':     function (o) { return sceneCompact(o, 'photo', o._data, 'card'); },
    'tp.message':   function (o) { return sceneCompact(o, 'message', o._data, 'card'); },
    // "Dinámica": en transparente, una petición puede tomar toda la pantalla.
    'tp.full':      function (o) { return sceneFull(o, 'photo', o._data); }
  };

  function EnjoyScreen(mount, userOpts) {
    var o = Object.assign({
      scene: 'club.idle',
      mode: 'club',          // 'club' | 'tp'
      position: 'bottom-right',
      fx: false,             // efectos completos (solo PC potente)
      free: false,           // peticiones gratis → chip GRATIS
      amount: 0,             // € de la puja → tramo de pago
      showCover: true,       // carátulas de canciones
      videos: true,          // en transparente, playlist de vídeo de fondo
      videoCover: true,      // llenar pantalla (true) o respetar formato (false)
      ranking: false,
      toasts: false,
      _cta: 0, _i: 0, _qrHidden: false, _data: {}
    }, userOpts || {});

    mount.classList.add('es-stage');
    mount.innerHTML =
      '<div class="es-layer es-base"></div>' +
      '<div class="es-layer es-scene"></div>' +
      '<div class="es-layer es-over"></div>' +
      '<aside class="es-ranking"></aside>';

    var elBase  = mount.querySelector('.es-base');
    var elScene = mount.querySelector('.es-scene');
    var elOver  = mount.querySelector('.es-over');
    var elRank  = mount.querySelector('.es-ranking');
    elRank.innerHTML = rankingHTML();

    var timers = [], vid = null, vidIdx = 0, lastBase = '';

    function after(ms, fn) { var t = setTimeout(fn, ms); timers.push(t); return t; }

    /* --- Fondo ---------------------------------------------------------- */
    function renderBase() {
      var key = o.mode + '|' + (o.videos ? '1' : '0') + '|' + (o.fx ? '1' : '0') + '|' + (o.videoCover ? '1' : '0');
      if (key === lastBase) return;         // no reiniciar el vídeo sin motivo
      lastBase = key;
      vid = null;

      if (o.mode === 'club') {
        elBase.className = 'es-layer es-base es-bg-club' + (o.fx ? ' fx' : '');
        elBase.innerHTML = o.fx
          ? '<span class="es-blob-anchor"><span class="es-blob es-blob--orange"></span></span>' +
            '<span class="es-blob-anchor es-orbit"><span class="es-blob es-blob--pink"></span></span>' +
            '<span class="es-blob-anchor es-orbit delay"><span class="es-blob es-blob--yellow"></span></span>' +
            '<div class="es-particles">' + particles() + '</div>'
          : '';
        return;
      }
      // Transparente: o la playlist de vídeo, o el damero de "aquí no hay nada".
      if (o.videos && A.videos && A.videos.length) {
        elBase.className = 'es-layer es-base';
        elBase.innerHTML = '<video class="es-bg-video' + (o.videoCover ? '' : ' contain') + '" muted playsinline></video>';
        vid = elBase.querySelector('video');
        vid.addEventListener('ended', nextClip);
        vid.addEventListener('error', nextClip);
        playClip();
      } else if (o.videos) {
        elBase.className = 'es-layer es-base';
        elBase.innerHTML = '<div class="es-bg-fake"></div>';
      } else {
        elBase.className = 'es-layer es-base es-bg-tp';
        elBase.innerHTML = '';
      }
    }
    function particles() {
      var out = '';
      for (var i = 0; i < 18; i++) {
        var s = 2 + Math.random() * 3;
        out += '<span style="left:' + (Math.random() * 100) + '%;width:' + s + 'px;height:' + s +
               'px;opacity:' + (0.14 + Math.random() * 0.22) + ';animation-duration:' + (14 + Math.random() * 20) +
               's;animation-delay:' + (-Math.random() * 30) + 's;--drift:' + (-40 + Math.random() * 80) + 'px"></span>';
      }
      return out;
    }
    /* La playlist: un solo <video>, se le cambia el src al acabar cada clip.
       Así es exactamente como lo hace el producto (no crea players nuevos). */
    function playClip() {
      if (!vid || !A.videos.length) return;
      vid.src = A.videos[vidIdx % A.videos.length];
      vid.load();
      var p = vid.play();
      if (p && p.catch) p.catch(function () {});
    }
    function nextClip() { vidIdx++; playClip(); }

    /* --- Estado --------------------------------------------------------- */
    function renderScene() {
      var fn = SCENES[o.scene] || SCENES['club.idle'];
      elScene.innerHTML = fn(o);
    }
    function renderOver() {
      var html = '';
      if (o.toasts && o.mode === 'club') {
        var raised = o.scene !== 'club.idle' && o.scene !== 'club.toast';
        html += '<div class="es-toasts' + (o.ranking ? ' shift' : '') + (raised ? ' raised' : '') + '">' +
                toastHTML(o._i) + toastHTML(o._i + 3) + '</div>';
      }
      if (o._price) html += priceHTML(o, o._price.text, o._price.kind);
      elOver.innerHTML = html;
    }
    function render() { renderBase(); renderScene(); renderOver(); elRank.classList.toggle('open', !!o.ranking && o.mode === 'club'); }

    /* --- API ------------------------------------------------------------ */
    var api = {
      /** Pinta un estado. `show('club.photo')` o `show('club.song', {song, artist, by, dedication, amount})` */
      show: function (scene, data) {
        o.scene = scene;
        o.mode = scene.indexOf('tp.') === 0 ? 'tp' : 'club';
        o._i++;
        o._data = Object.assign({ amount: o.amount }, defaultData(scene), data || {});
        render();
        return api;
      },
      /** Cambia una opción: set('fx', true), set('position','center'), set('amount',120)… */
      set: function (k, v) {
        o[k] = v;
        if (k === 'amount') o._data.amount = v;
        render();
        return api;
      },
      get: function (k) { return o[k]; },
      /** Dispara el aviso de precio (el producto lo lanza solo al cambiar la tarifa). */
      price: function (text, kind) {
        o._price = { text: text, kind: kind || 'up' };
        renderOver();
        after(7000, function () { o._price = null; renderOver(); });
        return api;
      },
      /** Guion automático: encadena los estados en bucle. Para dejarlo rodando. */
      auto: function (on) { on === false ? stopAuto() : startAuto(); return api; },
      destroy: function () { stopAuto(); clearInterval(ctaTimer); timers.forEach(clearTimeout); timers = []; mount.innerHTML = ''; }
    };

    function defaultData(scene) {
      if (scene === 'club.promo') return { by: A.venueName || '', dedication: '' };
      if (scene.indexOf('photo') >= 0 || scene === 'tp.full') return pick(D.photos, o._i);
      if (scene.indexOf('message') >= 0) return pick(D.messages, o._i);
      return pick(D.songs, o._i);
    }

    /* --- Guion automático -------------------------------------------------
       Un recorrido comercial: empieza vendiendo el reclamo, enseña una
       petición, sube a foto, enseña el ranking, y termina en transparente
       para explicar que se superpone a los visuales del local. */
    var autoTimer = null, step = 0;
    var SCRIPT = [
      { ms: 5000,  run: function () { o.ranking = false; o.toasts = false; api.show('club.idle'); } },
      { ms: 3500,  run: function () { o.toasts = true; o._cta++; api.show('club.idle'); } },
      { ms: 6000,  run: function () { o.toasts = false; api.set('amount', 0); api.show('club.song'); } },
      { ms: 6000,  run: function () { api.set('amount', 20); api.show('club.photo'); } },
      { ms: 5500,  run: function () { api.set('amount', 0); api.show('club.message'); } },
      { ms: 6000,  run: function () { api.show('club.idle'); o.ranking = true; render(); } },
      { ms: 4000,  run: function () { o.ranking = false; api.set('amount', 0); api.show('club.toast'); } },
      { ms: 5000,  run: function () { o.position = 'bottom-right'; api.show('tp.idle'); } },
      { ms: 5000,  run: function () { api.set('amount', 0); api.show('tp.photo'); } },
      { ms: 4500,  run: function () { api.set('amount', 120); api.show('tp.song'); } },
      { ms: 5000,  run: function () { api.set('amount', 0); api.show('tp.full'); } }
    ];
    function startAuto() {
      stopAuto();
      function tick() {
        var s = SCRIPT[step % SCRIPT.length];
        step++;
        s.run();
        autoTimer = setTimeout(tick, s.ms);
      }
      tick();
    }
    function stopAuto() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } }

    /* Rotación del reclamo bilingüe, igual que en el producto. */
    var ctaTimer = setInterval(function () {
      if (o.scene === 'club.idle' || o.scene === 'tp.idle' || o.scene === 'club.toast') {
        o._cta++; renderScene();
      }
    }, 4500);

    render();
    return api;
  }

  window.EnjoyScreen = EnjoyScreen;
  window.EnjoyScreen.POSITIONS = POSITIONS;
  window.EnjoyScreen.SCENES = Object.keys(SCENES);
})();
export {};
