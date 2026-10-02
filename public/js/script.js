/* nexustvplay - script.js (Akash single-origin) */

let canais = [];
let termoBusca = '';
let categoriaAtual = 'Todas';
let canalAtual = null;
let hls = null;

let tokenRenewInterval = null;
let servidorAtual = 0;
let hideServerTimer = null;

const FAV_KEY = 'nexus_favoritos';
const HIST_KEY = 'nexus_historico';
const SRV_KEY = 'nexus_servidor';

function getFavoritos() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
function setFavoritos(arr) { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); }
function isFavorito(id) { return getFavoritos().includes(id); }
function toggleFavorito(id) {
  let favs = getFavoritos();
  if (favs.includes(id)) favs = favs.filter(x => x !== id);
  else favs.unshift(id);
  setFavoritos(favs);
  return favs.includes(id);
}
function getHistorico() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } }
function addHistorico(id) {
  let hist = getHistorico().filter(x => x !== id);
  hist.unshift(id);
  hist = hist.slice(0, 10);
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
}

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const modal = document.getElementById('modal');
const player = document.getElementById('player');
const playerLoading = document.getElementById('playerLoading');
const playerError = document.getElementById('playerError');
const modalTitle = document.getElementById('modalTitle');
const categoriasEl = document.getElementById('categorias');
const tituloCategoria = document.getElementById('tituloCategoria');
const searchInput = document.getElementById('search');
const searchClear = document.getElementById('searchClear');
const favSection = document.getElementById('favSection');
const favGrid = document.getElementById('favGrid');
const favCount = document.getElementById('favCount');
const histSection = document.getElementById('histSection');
const histCarousel = document.getElementById('histCarousel');
const favBtnModal = document.getElementById('favBtnModal');
const serverSwitch = document.getElementById('serverSwitch');
const rotateHint = document.getElementById('rotateHint');
let orientLock = false;

function gerarLogo(nome, id) {
  const palavras = nome.replace(/[•\-]/g, ' ').split(' ').filter(Boolean);
  let iniciais = '';
  if (palavras.length === 1) iniciais = palavras[0].substring(0, 3).toUpperCase();
  else iniciais = palavras.slice(0, 3).map(p => p[0]).join('').toUpperCase();
  const cores = [['00d4ff','060a14'],['0a84ff','060a14'],['ff2d55','060a14'],['00b8e6','060a14'],['0066cc','060a14'],['ff0033','060a14']];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
  const [fg, bg] = cores[hash % cores.length];
  return `https://placehold.co/300x300/${bg}/${fg}?text=${encodeURIComponent(iniciais)}&font=montserrat&bold=true`;
}

function cardHTML(c, i) {
  const fallback = gerarLogo(c.nome, c.id);
  const src = c.logo || fallback;
  const fav = isFavorito(c.id);
  return `
    <div class="card" style="animation-delay:${Math.min(i * 20, 500)}ms" data-id="${c.id}">
      <button class="fav-icon ${fav ? 'active' : ''}" data-fav="${c.id}">
        <i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i>
      </button>
      <div class="card-img-wrap">
        <span class="card-live"><span class="dot"></span>AO VIVO</span>
        <img class="card-logo" src="${src}" data-fallback="${fallback}" alt="${c.nome}" loading="lazy"
             onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}">
      </div>
      <div class="card-body">
        <h3>${c.nome}</h3>
        <p>${c.categoria || 'Canal'}</p>
      </div>
    </div>`;
}

async function carregarCanais() {
  try {
    const r = await fetch('/api/canais');
    if (!r.ok) throw new Error('API');
    canais = await r.json();
    renderCategorias();
    renderCanais();
    renderFavoritos();
    renderHistorico();
  } catch (e) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = 'Erro ao carregar canais.';
  }
}

function renderCategorias() {
  const contagem = {};
  canais.forEach(c => { const cat = c.categoria || 'Outros'; contagem[cat] = (contagem[cat] || 0) + 1; });
  const cats = ['Todas', ...Object.keys(contagem).sort()];
  categoriasEl.innerHTML = cats.map(cat => {
    const qtd = cat === 'Todas' ? canais.length : contagem[cat];
    return `<button class="cat-btn ${cat === categoriaAtual ? 'active' : ''}" data-cat="${cat}">${cat} <span class="cat-count">${qtd}</span></button>`;
  }).join('');
  categoriasEl.querySelectorAll('.cat-btn').forEach(b => {
    b.addEventListener('click', () => {
      categoriaAtual = b.dataset.cat;
      tituloCategoria.textContent = categoriaAtual === 'Todas' ? 'Todos os Canais' : categoriaAtual;
      renderCategorias();
      renderCanais();
    });
  });
}

function filtrar() {
  return canais.filter(c => {
    const matchCat = categoriaAtual === 'Todas' || c.categoria === categoriaAtual;
    const matchBusca = !termoBusca || c.nome.toLowerCase().includes(termoBusca);
    return matchCat && matchBusca;
  });
}

function renderCanais() {
  const filtrados = filtrar();
  if (!filtrados.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = termoBusca ? `Nenhum canal encontrado para "${termoBusca}".` : 'Nenhum canal nesta categoria.';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = filtrados.map((c, i) => cardHTML(c, i)).join('');
  bindCards(grid);
}

function renderFavoritos() {
  const favs = getFavoritos();
  const canaisFav = favs.map(id => canais.find(c => c.id === id)).filter(Boolean);
  if (!canaisFav.length) { favSection.style.display = 'none'; return; }
  favSection.style.display = 'block';
  favCount.textContent = canaisFav.length;
  favGrid.innerHTML = canaisFav.map((c, i) => cardHTML(c, i)).join('');
  bindCards(favGrid);
}

function renderHistorico() {
  const hist = getHistorico();
  const canaisHist = hist.map(id => canais.find(c => c.id === id)).filter(Boolean);
  if (!canaisHist.length) { histSection.style.display = 'none'; return; }
  histSection.style.display = 'block';
  histCarousel.innerHTML = canaisHist.map(c => {
    const fallback = gerarLogo(c.nome, c.id);
    const src = c.logo || fallback;
    return `<div class="hist-card" data-id="${c.id}"><div class="hist-img-wrap"><img src="${src}" data-fallback="${fallback}" alt="${c.nome}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback='';}"></div><p>${c.nome}</p></div>`;
  }).join('');
  histCarousel.querySelectorAll('.hist-card').forEach(el => {
    el.addEventListener('click', () => abrirCanal(el.dataset.id));
  });
}

function bindCards(container) {
  container.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.fav-icon')) return;
      abrirCanal(el.dataset.id);
    });
  });
  container.querySelectorAll('.fav-icon').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.fav;
      const ativo = toggleFavorito(id);
      document.querySelectorAll(`.fav-icon[data-fav="${id}"]`).forEach(b => {
        b.classList.toggle('active', ativo);
        b.querySelector('i').className = ativo ? 'fa-solid fa-star' : 'fa-regular fa-star';
      });
      renderFavoritos();
      if (canalAtual && canalAtual.id === id) atualizarBotaoFavModal();
    });
  });
}

async function abrirCanal(id) {
  const canal = canais.find(c => c.id === id);
  if (!canal) return;
  canalAtual = canal;
  addHistorico(id);
  renderHistorico();

  document.body.classList.add('player-fullscreen');
  modal.classList.add('open');
  modalTitle.textContent = canal.nome;
  atualizarBotaoFavModal();

  const tem2 = (canal.qtd_servidores || 1) >= 2;
  servidorAtual = tem2 ? 1 : 0;

  montarBotoesServidor();
  await carregarStream(id, servidorAtual);
  iniciarAutoRenew(id);
  setTimeout(tentarFullscreen, 150);
  mostrarServerSwitch();
  checarOrientacao();
}

function montarBotoesServidor() {
  if (!canalAtual) return;
  const qtd = canalAtual.qtd_servidores || 1;
  if (qtd < 2) {
    serverSwitch.style.display = 'none';
    serverSwitch.classList.remove('visible', 'idle');
    return;
  }
  serverSwitch.style.display = 'flex';
  serverSwitch.innerHTML = `<button class="srv-text" id="srvBtn">
    <i class="fa-solid fa-triangle-exclamation"></i>
    Canal travou? Clique aqui
  </button>`;
  const btn = document.getElementById('srvBtn');
  if (btn) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const proximo = (servidorAtual + 1) % qtd;
      servidorAtual = proximo;
      localStorage.setItem(SRV_KEY, proximo);
      montarBotoesServidor();
      await carregarStream(canalAtual.id, proximo);
      mostrarServerSwitch();
    });
  }
}

function mostrarServerSwitch() {
  if (!serverSwitch || serverSwitch.style.display === 'none') return;
  posicionarServerSwitch();
  serverSwitch.classList.add('visible');
  serverSwitch.classList.remove('idle');
  clearTimeout(hideServerTimer);
  hideServerTimer = setTimeout(() => {
    serverSwitch.classList.remove('visible', 'idle', 'armed');
  }, 4000);
}

function atualizarBotaoFavModal() {
  if (!canalAtual) return;
  const fav = isFavorito(canalAtual.id);
  favBtnModal.classList.toggle('active', fav);
  favBtnModal.innerHTML = fav
    ? '<i class="fa-solid fa-star"></i> <span>Nos Favoritos</span>'
    : '<i class="fa-regular fa-star"></i> <span>Adicionar aos Favoritos</span>';
}

favBtnModal.addEventListener('click', () => {
  if (!canalAtual) return;
  const id = canalAtual.id;
  const ativo = toggleFavorito(id);
  document.querySelectorAll(`.fav-icon[data-fav="${id}"]`).forEach(b => {
    b.classList.toggle('active', ativo);
    b.querySelector('i').className = ativo ? 'fa-solid fa-star' : 'fa-regular fa-star';
  });
  atualizarBotaoFavModal();
  renderFavoritos();
});

function tentarFullscreen() {
  const el = document.querySelector('.player-wrap');
  if (!el) return;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && modal.classList.contains('open')) fecharModal();
});
document.addEventListener('webkitfullscreenchange', () => {
  if (!document.webkitFullscreenElement && modal.classList.contains('open')) fecharModal();
});

async function carregarStream(id, idx = 0) {
  playerError.style.display = 'none';
  playerLoading.style.display = 'flex';

  if (hls) {
    try { hls.stopLoad(); } catch(e) {}
    try { hls.detachMedia(); } catch(e) {}
    try { hls.destroy(); } catch(e) {}
    hls = null;
  }
  try {
    player.pause();
    player.removeAttribute('src');
    player.load();
  } catch(e) {}

  try {
    const t = await fetch(`/api/token/${id}`).then(r => r.json());
    if (!t.token) throw new Error('Token');
    const w = await fetch(`/api/watch/${id}?t=${t.token}&s=${idx}`).then(r => r.json());
    if (!w.url) throw new Error('Stream');
    iniciarPlayer(w.url);
  } catch (e) {
    playerLoading.style.display = 'none';
    playerError.style.display = 'flex';
  }
}

function iniciarAutoRenew(id) {
  pararAutoRenew();
  tokenRenewInterval = setInterval(async () => {
    if (!modal.classList.contains('open')) { pararAutoRenew(); return; }
    try { await fetch(`/api/token/${id}`).then(r => r.json()); } catch (e) {}
  }, 4 * 60 * 1000);
}
function pararAutoRenew() {
  if (tokenRenewInterval) { clearInterval(tokenRenewInterval); tokenRenewInterval = null; }
}

function iniciarPlayer(url) {
  if (hls) { try { hls.destroy(); } catch(e) {} hls = null; }

  if (Hls.isSupported() && url.endsWith('.m3u8')) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 5,
    });
    hls.loadSource(url);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playerLoading.style.display = 'none';
      player.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (e, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); return; } catch(err) {}
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); return; } catch(err) {}
        }
        playerLoading.style.display = 'none';
        playerError.style.display = 'flex';
      }
    });
  } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = url;
    player.addEventListener('loadedmetadata', () => {
      playerLoading.style.display = 'none';
      player.play().catch(() => {});
    }, { once: true });
    player.addEventListener('error', () => {
      playerLoading.style.display = 'none';
      playerError.style.display = 'flex';
    }, { once: true });
  } else {
    playerLoading.style.display = 'none';
    playerError.style.display = 'flex';
  }
}

player.addEventListener('click', mostrarServerSwitch);
player.addEventListener('touchstart', mostrarServerSwitch, { passive: true });
const playerWrap = document.querySelector('.player-wrap');
if (playerWrap) playerWrap.addEventListener('click', (e) => {
  if (e.target === player || e.target === playerWrap) mostrarServerSwitch();
});

function fecharModal() {
  modal.classList.remove('open');
  document.body.classList.remove('player-fullscreen');
  player.pause();
  if (hls) { hls.destroy(); hls = null; }
  pararAutoRenew();
  clearTimeout(hideServerTimer);
  if (serverSwitch) serverSwitch.classList.remove('visible', 'idle', 'armed');
  if (rotateHint) rotateHint.classList.remove('show');
  if (orientLock) { try { screen.orientation.unlock(); } catch (e) {} orientLock = false; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (document.webkitFullscreenElement) document.webkitExitFullscreen();
}
document.getElementById('modalClose').addEventListener('click', fecharModal);
modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

searchInput.addEventListener('input', e => {
  termoBusca = e.target.value.toLowerCase().trim();
  searchClear.style.display = termoBusca ? 'flex' : 'none';
  renderCanais();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  termoBusca = '';
  searchClear.style.display = 'none';
  renderCanais();
  searchInput.focus();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && modal.classList.contains('open')) {
    if (playerLoading) {
      playerLoading.style.display = 'flex';
      const txt = playerLoading.querySelector('p');
      if (txt) txt.textContent = 'Reconectando...';
    }
    setTimeout(() => {
      if (player && player.paused) player.play().catch(() => { playerLoading.style.display = 'none'; });
      else playerLoading.style.display = 'none';
    }, 600);
  }
});

carregarCanais();

document.addEventListener('pointerdown', (e) => {
  if (modal.classList.contains('open') && serverSwitch && serverSwitch.style.display !== 'none') {
    mostrarServerSwitch();
  }
}, true);

function posicionarServerSwitch() {
  if (!serverSwitch || !player) return;
  const vw = player.videoWidth || 0, vh = player.videoHeight || 0;
  const cw = player.clientWidth || 0, ch = player.clientHeight || 0;
  if (!vw || !vh || !cw || !ch) {
    serverSwitch.style.top = '12px';
    serverSwitch.style.right = '12px';
    return;
  }
  const scale = Math.min(cw / vw, ch / vh);
  const w = vw * scale, h = vh * scale;
  const x = (cw - w) / 2, y = (ch - h) / 2;
  serverSwitch.style.top = Math.max(y + 10, 10) + 'px';
  serverSwitch.style.right = Math.max(cw - (x + w) + 10, 10) + 'px';
}
player.addEventListener('loadedmetadata', posicionarServerSwitch);
window.addEventListener('resize', posicionarServerSwitch);
window.addEventListener('orientationchange', () => setTimeout(posicionarServerSwitch, 300));
document.addEventListener('fullscreenchange', () => setTimeout(posicionarServerSwitch, 300));

const esconderLoading = () => { playerLoading.style.display = 'none'; };
player.addEventListener('loadeddata', esconderLoading);
player.addEventListener('playing', esconderLoading);
player.addEventListener('waiting', () => {
  if (!modal.classList.contains('open')) return;
  playerLoading.style.display = 'flex';
  const t = playerLoading.querySelector('p');
  if (t) t.textContent = 'Sincronizando transmissão...';
});

let rotateTimer = null;
function checarOrientacao() {
  if (!rotateHint) return;
  const portrait = window.innerHeight > window.innerWidth;
  if (modal.classList.contains('open') && portrait) {
    rotateHint.classList.add('show');
    clearTimeout(rotateTimer);
    rotateTimer = setTimeout(() => rotateHint.classList.remove('show'), 3000);
  } else {
    rotateHint.classList.remove('show');
  }
}
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    checarOrientacao();
    posicionarServerSwitch();
    mostrarServerSwitch();
  }, 300);
});
window.addEventListener('resize', checarOrientacao);

if (screen.orientation && screen.orientation.addEventListener) {
  screen.orientation.addEventListener('change', () => {
    setTimeout(() => {
      posicionarServerSwitch();
      checarOrientacao();
      mostrarServerSwitch();
    }, 300);
  });
}

const fsBtn = document.getElementById('fsBtn');
function setIconFs(lock) {
  if (fsBtn) fsBtn.querySelector('i').className = lock ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
}
async function travarPaisagem() {
  try {
    await screen.orientation.lock('landscape');
    orientLock = true;
    setIconFs(true);
  } catch (e) {
    orientLock = false;
    setIconFs(false);
  }
}
if (fsBtn && !fsBtn.dataset.ready) {
  fsBtn.dataset.ready = '1';
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fs) {
      tentarFullscreen();
      setTimeout(travarPaisagem, 450);
    } else if (!orientLock) {
      travarPaisagem();
    } else {
      try { screen.orientation.unlock(); } catch (e) {}
      orientLock = false;
      setIconFs(false);
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  });
}

document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'VIDEO' || e.target.closest('video') || e.target.closest('.player-wrap')) {
    e.preventDefault();
    return false;
  }
}, true);
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'VIDEO') { e.preventDefault(); return false; }
});
function aplicarAntiDownload() {
  const player = document.getElementById('player');
  if (!player) return;
  player.setAttribute('controlsList', 'nodownload noremoteplayback noplaybackrate');
  player.setAttribute('disablePictureInPicture', '');
  player.oncontextmenu = () => false;
}
setTimeout(aplicarAntiDownload, 1000);
document.addEventListener('click', aplicarAntiDownload, { once: true });

(function() {
  setTimeout(() => {
    const ss = document.getElementById('serverSwitch');
    const fsBtn = document.getElementById('fsBtn');
    if (!ss || !fsBtn) return;
    const observer = new MutationObserver(() => {
      if (ss.classList.contains('visible') && !ss.classList.contains('idle')) {
        fsBtn.classList.add('visible');
      } else {
        fsBtn.classList.remove('visible');
      }
    });
    observer.observe(ss, { attributes: true, attributeFilter: ['class'] });
    const player = document.getElementById('player');
    if (player) {
      player.addEventListener('click', () => {
        fsBtn.classList.add('visible');
        clearTimeout(fsBtn._hideTimer);
        fsBtn._hideTimer = setTimeout(() => { fsBtn.classList.remove('visible'); }, 4000);
      });
      player.addEventListener('touchstart', () => {
        fsBtn.classList.add('visible');
        clearTimeout(fsBtn._hideTimer);
        fsBtn._hideTimer = setTimeout(() => { fsBtn.classList.remove('visible'); }, 4000);
      }, { passive: true });
    }
  }, 1500);
})();
