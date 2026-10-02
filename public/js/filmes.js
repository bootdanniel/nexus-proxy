(function() {
'use strict';

let filmesTodos = [];
let paginasCarregadas = 0;
let totalPaginas = 0;
let modoAtual = 'filmes';
let filmeAtual = null;
let hlsFilme = null;
let buscaIndex = null;

const carrosselState = {};

const btnModoFilmes = document.getElementById('btnModoFilmes');
const telaFilmes = document.getElementById('telaFilmes');
const telaCanais = document.getElementById('telaCanais');
const container = document.getElementById('carrosséisContainer');
const resultadoBusca = document.getElementById('resultadoBuscaFilmes');
const gridFilmesBusca = document.getElementById('gridFilmesBusca');
const emptyFilmes = document.getElementById('emptyFilmes');
const searchFilmesHome = document.getElementById('searchFilmesHome');
const searchFilmesClear = document.getElementById('searchFilmesClear');
const btnLoadMore = document.getElementById('btnLoadMore');
const modalFilme = document.getElementById('modal');
const modalFilmeClose = document.getElementById('modalClose');
const playerFilme = document.getElementById('player');
const filmeLoading = document.getElementById('playerLoading');
const filmeLoadingTxt = document.querySelector('#playerLoading p');
const filmeErro = document.getElementById('playerError');
const modalFilmeTitulo = document.getElementById('modalTitle');
const modalFilmeMeta = document.getElementById('modalMeta');
const modalFilmeSinopse = document.getElementById('modalSinopse');
const favBtnModal = document.getElementById('favBtnModal');

async function carregarPagina(n) {
  const r = await fetch(`filmes-json/page-${String(n).padStart(3, '0')}.json`);
  if (!r.ok) throw new Error(`Erro página ${n}`);
  return await r.json();
}

const _preloaded = new Set();
function preloadProximas() {
  const proximas = [paginasCarregadas + 1, paginasCarregadas + 2].filter(n => n <= totalPaginas && !_preloaded.has(n));
  proximas.forEach(n => {
    _preloaded.add(n);
    fetch(`filmes-json/page-${String(n).padStart(3, '0')}.json`).catch(() => {});
  });
}

function getFilmesDoCarrossel(id) {
  if (id === 'em-alta') {
    return [...filmesTodos].sort((a, b) => (b.add || '').localeCompare(a.add || ''));
  }
  if (id === 'lancamentos') {
    return filmesTodos.filter(f => parseInt(f.ano, 10) >= 2025);
  }
  const generoMap = {
    'acao': 'Ação',
    'aventura': 'Aventura',
    'comedia': 'Comédia',
    'drama': 'Drama',
    'animacao': 'Animação',
    'ficcao': 'Ficção científica',
    'terror': 'Terror',
    'romance': 'Romance',
  };
  const genero = generoMap[id];
  if (!genero) return [];
  return filmesTodos.filter(f => (f.generos || []).includes(genero));
}

function cardFilmeHTML(f, i) {
  const poster = f.poster || 'https://placehold.co/300x450/0a1020/00d4ff?text=?&font=montserrat';
  return `
    <div class="filme-card" data-id="${f.id}" style="animation-delay:${Math.min(i * 6, 200)}ms">
      <div class="filme-poster">
        <img src="${poster}" alt="${f.nome}" loading="lazy"
             onerror="this.src='https://placehold.co/300x450/0a1020/00d4ff?text=?&font=montserrat'">
        <div class="filme-hover"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="filme-info">
        <h3>${f.nome}</h3>
        <p>${f.ano || '—'}</p>
      </div>
    </div>`;
}

function renderCarrossel(id, titulo) {
  const lista = getFilmesDoCarrossel(id);
  if (!lista.length) return null;
  const offset = carrosselState[id] || 20;
  const div = document.createElement('section');
  div.className = 'carrossel-section';
  div.dataset.carrosselId = id;
  div.innerHTML = `
    <div class="carrossel-head">
      <h2>${titulo}</h2>
    </div>
    <div class="carrossel" data-car="${id}">
      ${lista.slice(0, offset).map((f, i) => cardFilmeHTML(f, i)).join('')}
    </div>
  `;
  div.querySelectorAll('.filme-card').forEach(el => {
    el.addEventListener('click', () => abrirFilme(parseInt(el.dataset.id, 10)));
  });
  return div;
}

function bindScrollInfinito(container) {
  container.querySelectorAll('.carrossel').forEach(car => {
    car.addEventListener('scroll', () => {
      const posFim = car.scrollLeft + car.clientWidth;
      const total = car.scrollWidth;
      if (posFim >= total * 0.85) {
        const id = car.dataset.car;
        const lista = getFilmesDoCarrossel(id);
        const offsetAtual = carrosselState[id] || 20;
        if (offsetAtual < lista.length) {
          appendMaisCards(car, 20);
        } else if (paginasCarregadas < totalPaginas) {
          carregarMaisPaginas();
        }
      }
    }, { passive: true });
  });
}

function appendMaisCards(car, quantidade) {
  const id = car.dataset.car;
  const lista = getFilmesDoCarrossel(id);
  const offsetAtual = carrosselState[id] || 20;
  if (offsetAtual >= lista.length) return;
  const novoOffset = Math.min(offsetAtual + quantidade, lista.length);
  const novos = lista.slice(offsetAtual, novoOffset);
  car.querySelectorAll('.filme-card').forEach(el => el.classList.add('bound'));
  const html = novos.map((f, i) => cardFilmeHTML(f, i)).join('');
  car.insertAdjacentHTML('beforeend', html);
  carrosselState[id] = novoOffset;
  car.querySelectorAll('.filme-card:not(.bound)').forEach(el => {
    el.classList.add('bound');
    el.addEventListener('click', () => abrirFilme(parseInt(el.dataset.id, 10)));
  });
}

function renderHome() {
  container.innerHTML = '';
  ['em-alta','lancamentos','acao','aventura','comedia','drama','animacao','ficcao','terror','romance'].forEach(id => {
    carrosselState[id] = 20;
  });
  const carrosséis = [
    ['em-alta', '🔥 Em Alta Hoje'],
    ['lancamentos', '🎬 Lançamentos'],
    ['acao', '💥 Ação'],
    ['aventura', '🗺️ Aventura'],
    ['comedia', '😂 Comédia'],
    ['drama', '🎭 Drama'],
    ['animacao', '🎨 Animação'],
    ['ficcao', '🚀 Ficção Científica'],
    ['terror', '👻 Terror'],
    ['romance', '💖 Romance'],
  ];
  carrosséis.forEach(([id, titulo]) => {
    const c = renderCarrossel(id, titulo);
    if (c) container.appendChild(c);
  });
  bindScrollInfinito(container);
}

let _carregandoMais = false;
async function carregarMaisPaginas() {
  if (_carregandoMais || paginasCarregadas >= totalPaginas) return;
  _carregandoMais = true;
  try {
    const prox = paginasCarregadas + 1;
    const novos = await carregarPagina(prox);
    filmesTodos = filmesTodos.concat(novos);
    paginasCarregadas = prox;
    preloadProximas();
    container.querySelectorAll('.carrossel').forEach(car => {
      const id = car.dataset.car;
      const lista = getFilmesDoCarrossel(id);
      const offsetAtual = carrosselState[id] || 20;
      if (offsetAtual < lista.length) {
        appendMaisCards(car, 20);
      }
    });
  } catch (e) {
    console.warn('[filmes] erro:', e);
  } finally {
    _carregandoMais = false;
  }
}

async function abrirFilme(id) {
  const filme = filmesTodos.find(f => f.id === id);
  if (!filme) return;
  filmeAtual = filme;

  const ss = document.getElementById('serverSwitch');
  if (ss) {
    ss.classList.remove('visible', 'idle', 'armed');
    ss.style.display = 'none';
  }

  modalFilme.classList.add('open');
  document.body.style.overflow = 'hidden';

  modalFilmeTitulo.textContent = filme.nome;
  modalFilmeMeta.textContent = [filme.ano, filme.dur_txt, filme.audio].filter(Boolean).join(' • ');
  modalFilmeMeta.style.display = 'block';
  modalFilmeSinopse.textContent = filme.plot || 'Sem sinopse disponível.';
  modalFilmeSinopse.style.display = 'block';
  if (favBtnModal) favBtnModal.style.display = 'none';

  filmeLoading.style.display = 'flex';
  filmeErro.style.display = 'none';
  if (filmeLoadingTxt) filmeLoadingTxt.textContent = 'Conectando ao servidor...';
  playerFilme.style.display = 'none';
  playerFilme.removeAttribute('src');
  if (hlsFilme) { hlsFilme.destroy(); hlsFilme = null; }

  try {
    if (filmeLoadingTxt) filmeLoadingTxt.textContent = 'Verificando acesso...';
    const titulo = encodeURIComponent(filme.nome);
    const r = await fetch(`/api/play/${filme.id}?t=${titulo}`);
    const data = await r.json();

    if (!data.url) {
      filmeLoading.style.display = 'none';
      filmeErro.style.display = 'flex';
      return;
    }

    if (filmeLoadingTxt) filmeLoadingTxt.textContent = 'Iniciando player...';
    iniciarPlayer(data.url);

  } catch (e) {
    filmeLoading.style.display = 'none';
    filmeErro.style.display = 'flex';
  }
}

function iniciarPlayer(url) {
  if (Hls.isSupported() && url.endsWith('.m3u8')) {
    hlsFilme = new Hls({ enableWorker: true, lowLatencyMode: false });
    hlsFilme.loadSource(url);
    hlsFilme.attachMedia(playerFilme);
    hlsFilme.on(Hls.Events.MANIFEST_PARSED, () => {
      filmeLoading.style.display = 'none';
      playerFilme.style.display = 'block';
      playerFilme.play().catch(() => {});
    });
    hlsFilme.on(Hls.Events.ERROR, (e, d) => {
      if (d.fatal) {
        filmeLoading.style.display = 'none';
        filmeErro.style.display = 'flex';
      }
    });
  } else {
    playerFilme.src = url;
    playerFilme.addEventListener('loadeddata', () => {
      filmeLoading.style.display = 'none';
      playerFilme.style.display = 'block';
      playerFilme.play().catch(() => {});
    }, { once: true });
    playerFilme.addEventListener('error', () => {
      filmeLoading.style.display = 'none';
      filmeErro.style.display = 'flex';
    }, { once: true });
  }
}

function fecharModalFilme() {
  modalFilme.classList.remove('open');
  document.body.style.overflow = '';
  playerFilme.pause();
  if (hlsFilme) { hlsFilme.destroy(); hlsFilme = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

modalFilmeClose && modalFilmeClose.addEventListener('click', fecharModalFilme);
modalFilme && modalFilme.addEventListener('click', e => { if (e.target === modalFilme) fecharModalFilme(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModalFilme(); });

let buscaTimer = null;
searchFilmesHome && searchFilmesHome.addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  searchFilmesClear.style.display = q ? 'flex' : 'none';

  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(() => {
    if (!q) {
      resultadoBusca.style.display = 'none';
      container.style.display = 'block';
      return;
    }

    if (!buscaIndex) {
      gridFilmesBusca.innerHTML = '<p style="text-align:center;padding:40px 0;color:var(--muted)"><i class="fa-solid fa-spinner fa-spin"></i> Carregando índice de busca...</p>';
      resultadoBusca.style.display = 'block';
      container.style.display = 'none';

      fetch('filmes-json/busca-index.json')
        .then(r => r.json())
        .then(idx => {
          buscaIndex = idx;
          buscarNoIndice(q);
        })
        .catch(() => {
          gridFilmesBusca.innerHTML = '';
          emptyFilmes.style.display = 'block';
          emptyFilmes.textContent = 'Erro ao carregar busca.';
        });
      return;
    }

    buscarNoIndice(q);
  }, 300);
});

function buscarNoIndice(q) {
  if (!buscaIndex) return;
  const filtrados = buscaIndex.filter(f => (f.n || '').toLowerCase().includes(q));
  container.style.display = 'none';
  resultadoBusca.style.display = 'block';

  if (!filtrados.length) {
    gridFilmesBusca.innerHTML = '';
    emptyFilmes.style.display = 'block';
    emptyFilmes.textContent = `Nenhum resultado para "${q}".`;
    return;
  }

  emptyFilmes.style.display = 'none';

  gridFilmesBusca.innerHTML = filtrados.slice(0, 200).map((f, i) => {
    const poster = f.p || 'https://placehold.co/300x450/0a1020/00d4ff?text=?&font=montserrat';
    return `
      <div class="filme-card" data-id="${f.i}" style="animation-delay:${Math.min(i * 6, 200)}ms">
        <div class="filme-poster">
          <img src="${poster}" alt="${f.n}" loading="lazy"
               onerror="this.src='https://placehold.co/300x450/0a1020/00d4ff?text=?&font=montserrat'">
          <div class="filme-hover"><i class="fa-solid fa-play"></i></div>
        </div>
        <div class="filme-info">
          <h3>${f.n}</h3>
          <p>${f.a || '—'}</p>
        </div>
      </div>`;
  }).join('');

  gridFilmesBusca.querySelectorAll('.filme-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id, 10);
      const completo = filmesTodos.find(x => x.id === id);
      if (completo) {
        abrirFilme(id);
      } else {
        const info = buscaIndex.find(x => x.i === id);
        if (info && info.pg) {
          carregarPagina(info.pg).then(pagina => {
            const fm = pagina.find(x => x.id === id);
            if (fm) {
              filmesTodos.push(fm);
              abrirFilme(id);
            }
          });
        }
      }
    });
  });
}

searchFilmesClear && searchFilmesClear.addEventListener('click', () => {
  searchFilmesHome.value = '';
  searchFilmesClear.style.display = 'none';
  resultadoBusca.style.display = 'none';
  container.style.display = 'block';
});

const btnVoltarFilmes = document.getElementById('btnVoltarFilmes');
btnVoltarFilmes && btnVoltarFilmes.addEventListener('click', () => {
  modoAtual = 'filmes';
  telaFilmes.style.display = 'block';
  telaCanais.style.display = 'none';
  if (btnModoFilmes) {
    btnModoFilmes.innerHTML = '<span class="tv-emoji">📺</span><span>Canais ao Vivo</span>';
    btnModoFilmes.classList.remove('ativo');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

btnModoFilmes && btnModoFilmes.addEventListener('click', () => {
  if (modoAtual === 'filmes') {
    modoAtual = 'canais';
    telaFilmes.style.display = 'none';
    telaCanais.style.display = 'block';
    btnModoFilmes.innerHTML = '<span class="tv-emoji">🎬</span><span>Filmes</span>';
    btnModoFilmes.classList.add('ativo');
  } else {
    modoAtual = 'filmes';
    telaFilmes.style.display = 'block';
    telaCanais.style.display = 'none';
    btnModoFilmes.innerHTML = '<span class="tv-emoji">📺</span><span>Canais ao Vivo</span>';
    btnModoFilmes.classList.remove('ativo');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

async function iniciar() {
  try {
    const idx = await fetch('filmes-json/index.json').then(r => r.json());
    totalPaginas = idx.total_paginas;

    const [p1, p2, p3] = await Promise.all([
      carregarPagina(1),
      carregarPagina(2),
      carregarPagina(3),
    ]);

    filmesTodos = [...p1, ...p2, ...p3];
    paginasCarregadas = 3;

    renderHome();
    preloadProximas();

    if (btnLoadMore) btnLoadMore.style.display = 'none';
  } catch (e) {
    console.warn('[home] erro:', e);
    container.innerHTML = '<p class="empty" style="padding:40px 0;text-align:center">Erro ao carregar filmes. Recarregue a página.</p>';
  }
}

iniciar();
console.log('[nexus] home carregada (scroll infinito)');

})();
