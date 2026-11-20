// O mapa visto do sol por páginas (spec 041, R11 revisto, T029): o endereçamento do atlas, comum ao desenho das páginas,
// às provas, à escolha do quadro e à leitura. Espelho de `reference/cloudShadowPages.ts`.
//
// Um mapa de recortes no plano perpendicular ao sol: `CLOUD_SHADOW_LEVELS` níveis, o texel do nível `k` é
// `clouds.sunMap.x·2ᵏ` em cima e a razão do degrau (`cloud_shadow_step_aspect`: 1, ½ ou 0,2 pela elevação do sol) vezes
// isso à direita, e cada nível tem `CLOUD_SHADOW_PAGES` páginas de `CLOUD_SHADOW_PAGE²` texels em cima e as do degrau à
// direita (`cloud_shadow_step_pages`: 8, 14 ou 32) em volta da câmera (a janela presa à página): o raio útil é o mesmo em
// metros nos dois eixos. Cada degrau tem o seu lugar nas `CLOUD_SHADOW_PAGES_X` páginas físicas à direita do nível
// (`cloud_shadow_step_base`: o de 0,2 nas 32 primeiras, o de ½ nas 14 seguintes, o de 1 nas 8 primeiras), e dois
// degraus vizinhos não se sobrepõem: na troca de degrau os dois mapas ficam residentes e a leitura os mistura ao longo de
// `CLOUD_SHADOW_STEP_FRAMES` quadros (`CloudShadowMaps`, o estado na série do registro). O plano passa pelo pivô
// `clouds.sunFrame.xyz` — o vento × tempo mais a célula da grade do pivô —: o conteúdo de uma página anda com as
// nuvens, e o vento uniforme não a invalida. A base do plano (`sunRight`, `sunUp`) é a rotação mínima de +y ao sol
// (contínua: o sol que anda gira o plano aos poucos); a câmera no plano em `sunRight.w`, `sunUp.w`. Endereço toroidal
// (`g mod N`, como a tabela do mapa de sombra virtual da 034); todas as páginas da janela residentes, e a que entra na
// janela de um mapa lido é desenhada no mesmo quadro. A página física tem um texel a mais em +x e +y (a coluna da
// vizinha): o par do filtro bilinear fica sempre nela.
// Requer: clouds.

/** Texels por lado do interior de uma página. */
const CLOUD_SHADOW_PAGE: u32 = 16u;
/** Texels por lado da página física (o interior e a coluna da vizinha em +x e +y). */
const CLOUD_SHADOW_STRIDE: u32 = 17u;
/** Texels de uma página física. */
const CLOUD_SHADOW_PAGE_TEXELS: u32 = 289u;
/** Páginas de um nível em cima. */
const CLOUD_SHADOW_PAGES: u32 = 8u;
/** Páginas físicas de um nível à direita: as janelas de dois degraus vizinhos lado a lado (0,2 e ½: 32 + 14). */
const CLOUD_SHADOW_PAGES_X: u32 = 46u;
/** A menor razão do texel à direita pelo em cima (o sol rasante). */
const CLOUD_SHADOW_ASPECT_MIN: f32 = 0.2;
/** tan da elevação do sol acima da qual o texel é quadrado (19°): a razão contínua é `tan(el)/tan(19°)`. */
const CLOUD_SHADOW_ASPECT_TAN: f32 = 0.344327613;
/** A folga da volta a um degrau mais grosso (o sol subindo): a contínua 5 % acima do limiar. */
const CLOUD_SHADOW_STEP_HYSTERESIS: f32 = 1.05;
/** A página física fora dos mapas do quadro (os degraus são 0: 1, 1: ½, 2: 0,2). */
const CLOUD_SHADOW_STEP_NONE: u32 = 3u;
/** Quadros da mistura de um degrau ao vizinho (com o mapa novo inteiro desenhado, o peso dele sobe 1/N por quadro). */
const CLOUD_SHADOW_STEP_FRAMES: f32 = 32.0;
/** Níveis do mapa. */
const CLOUD_SHADOW_LEVELS: u32 = 8u;
/** Páginas físicas por linha do atlas. */
const CLOUD_SHADOW_SLOTS_X: u32 = 55u;
/** Páginas no atlas (os lugares dos três degraus em todos os níveis). */
const CLOUD_SHADOW_SLOT_COUNT: u32 = 2944u;
/**
 * O registro do estado dos mapas (`CloudShadowMaps`), logo depois dos das páginas, na mesma série (o carimbo é o do
 * lugar do atlas de mesmo índice, que nenhuma página usa): `page_x` o degrau de onde, `page_y` o para onde, `time` o peso.
 */
const CLOUD_SHADOW_STATE_SLOT: u32 = 2944u;
/** Lado do atlas em texels. */
const CLOUD_SHADOW_ATLAS: f32 = 935.0;
/** Colunas de prova de uma página no quadro em que ela prova. */
const CLOUD_SHADOW_PROBES: u32 = 4u;
/**
 * Quadros entre as provas de uma página (em rodízio pela página física: um quarto delas prova por quadro). Cada prova é
 * uma coluna inteira num laço de até 196 amostras numa invocação; com todas as páginas provando a cada quadro, o passe do
 * mapa custava o das provas — 0,56 ms com o sol a 4° e 512 páginas (as colunas de ~30 km) sem nenhuma página desenhada.
 */
const CLOUD_SHADOW_PROBE_PERIOD: u32 = 8u;

/** A página física `slot` prova no quadro `frame`? */
fn cloud_shadow_probes_now(slot: u32, frame: u32) -> bool {
    return (slot + frame) % CLOUD_SHADOW_PROBE_PERIOD == 0u;
}

/**
 * Os mapas do quadro: o degrau de onde (`leaving`), o para onde (`entering`) e o peso do `entering` na leitura (com `leaving == entering`, só
 * ele). Na troca de degrau os dois ficam residentes; a leitura mistura `(1 − weight)` do `leaving` e `weight` do `entering`.
 */
struct CloudShadowMaps {
    leaving: u32,
    entering: u32,
    weight: f32,
}

/** O peso do degrau `m` na leitura do quadro (0: a página física dele não é lida). */
fn cloud_shadow_step_weight(maps: CloudShadowMaps, m: u32) -> f32 {
    if (maps.leaving == maps.entering) { return select(0.0, 1.0, m == maps.entering); }
    if (m == maps.entering) { return maps.weight; }
    if (m == maps.leaving) { return 1.0 - maps.weight; }
    return 0.0;
}

/**
 * A razão do texel à direita pelo em cima do degrau `m` (espelho de `shadowStepAspect`). Os nós de uma coluna estão em
 * frações do trecho dela, e com o sol baixo a vizinha em cima é o mesmo caminho deslocado ao longo de si
 * (~Δ/tan(elevação)): a resolução em cima sobra. A vizinha à direita é outro caminho de ~30 km pelo detalhe de ~56 m, e a
 * bilinear de τ entre elas (que reduz a variância de τ) escurecia a borda prateada das nuvens a 50–100 km rente ao sol
 * (`sunset`; medido em f64: o texel à direita ÷2 leva o erro do mapa de 10,1 a 5,6 %, em cima ÷2 ou ÷4 não muda nada;
 * na GPU, 5,4 % com ¼ e 5,3 % com 0,2). Com o sol alto o texel quadrado (a borda do feixe que sai de um vão, `beam-gap`,
 * lida com o texel de 0,2 à direita a 35° saía 11,8 px mais larga que a f64).
 */
fn cloud_shadow_step_aspect(m: u32) -> f32 {
    if (m == 0u) { return 1.0; }
    if (m == 1u) { return 0.5; }
    return CLOUD_SHADOW_ASPECT_MIN;
}

/** A razão contínua `tan(el)/tan(19°)` do sol `s`. */
fn cloud_shadow_continuous(s: vec3f) -> f32 {
    let el = clamp(s.y, -1.0, 1.0);
    return el / max(sqrt(max(1.0 - el * el, 0.0)), 1e-6) / CLOUD_SHADOW_ASPECT_TAN;
}

/** O degrau da razão contínua `c` com os limiares × `h` (1 a partir de `h`, ½ a partir de `h/2`, 0,2 abaixo). */
fn cloud_shadow_step_of(c: f32, h: f32) -> u32 {
    if (c >= h) { return 0u; }
    if (c >= 0.5 * h) { return 1u; }
    return 2u;
}

/**
 * O degrau que o sol `s` pede com o mapa no degrau `now` (espelho de `shadowStepTarget`): o mais fino logo que a contínua
 * cai abaixo do limiar (a razão nunca acima da contínua), o mais grosso só com a folga `CLOUD_SHADOW_STEP_HYSTERESIS` (o
 * sol que oscila no limiar não troca de degrau a cada quadro). A razão que mudasse a cada quadro escalaria o texel em
 * torno do pivô (o `solposto`: o chão 27 níveis num quadro); a troca de degrau num quadro mudava a resolução do mapa
 * inteiro de uma vez (7,9 níveis no céu no degrau de ~9,8°): agora os dois mapas misturados (`CloudShadowMaps`).
 */
fn cloud_shadow_step_target(now: u32, s: vec3f) -> u32 {
    let c = cloud_shadow_continuous(s);
    let fine = cloud_shadow_step_of(c, 1.0);
    if (fine > now) { return fine; }
    return min(now, cloud_shadow_step_of(c, CLOUD_SHADOW_STEP_HYSTERESIS));
}

/**
 * As páginas da janela à direita do degrau `m` (espelho de `shadowStepPages`): as que dão o raio útil em metros do em
 * cima (`(4 − 1)·16 − 2 = 46` texels em cima, `46/r + 2` à direita: 2 × (⌈(46/r + 2)/16⌉ + 1) — 8, 14 e 32).
 */
fn cloud_shadow_step_pages(m: u32) -> u32 {
    let useful = f32((CLOUD_SHADOW_PAGES / 2u - 1u) * CLOUD_SHADOW_PAGE - 2u);
    return 2u * (u32(ceil((useful / cloud_shadow_step_aspect(m) + 2.0) / f32(CLOUD_SHADOW_PAGE))) + 1u);
}

/** A primeira página física à direita do degrau `m` no nível (0,2 e 1 a partir de 0, ½ a partir de 32). */
fn cloud_shadow_step_base(m: u32) -> u32 {
    return select(0u, cloud_shadow_step_pages(2u), m == 1u);
}

/** Texel (m, à direita e em cima) do nível `k` com a razão `a` à direita. */
fn cloud_shadow_texel_aspect(k: u32, a: f32) -> vec2f {
    return clouds.sunMap.x * exp2(f32(k)) * vec2f(a, 1.0);
}

/** Texel (m, à direita e em cima) do nível `k` no degrau `m`. */
fn cloud_shadow_step_texel(k: u32, m: u32) -> vec2f {
    return cloud_shadow_texel_aspect(k, cloud_shadow_step_aspect(m));
}

/** Raio útil (m, Chebyshev, o mesmo nos dois eixos e em todo degrau) do nível `k`: a janela menos a borda do filtro e da penumbra. */
fn cloud_shadow_usable(k: u32) -> f32 {
    return f32((CLOUD_SHADOW_PAGES / 2u - 1u) * CLOUD_SHADOW_PAGE - 2u) * clouds.sunMap.x * exp2(f32(k));
}

/** A câmera no plano (m). */
fn cloud_shadow_camera() -> vec2f {
    return vec2f(clouds.sunRight.w, clouds.sunUp.w);
}

/** Coordenadas (m) de `p` no plano do mapa. */
fn cloud_shadow_plane(p: vec3f) -> vec2f {
    let rel = p - clouds.sunFrame.xyz;
    return vec2f(dot(rel, clouds.sunRight.xyz), dot(rel, clouds.sunUp.xyz));
}

/** O ponto do plano de coordenadas `x` (m). */
fn cloud_shadow_plane_point(x: vec2f) -> vec3f {
    return clouds.sunFrame.xyz + clouds.sunRight.xyz * x.x + clouds.sunUp.xyz * x.y;
}

/** As páginas da janela do degrau `m` (à direita, em cima). */
fn cloud_shadow_window_pages(m: u32) -> vec2u {
    return vec2u(cloud_shadow_step_pages(m), CLOUD_SHADOW_PAGES);
}

/** Primeira página global da janela do nível `k` no degrau `m`. */
fn cloud_shadow_window(k: u32, m: u32) -> vec2i {
    let s = f32(CLOUD_SHADOW_PAGE) * cloud_shadow_step_texel(k, m);
    return vec2i(floor(cloud_shadow_camera() / s)) - vec2i(cloud_shadow_window_pages(m) / 2u);
}

/** As páginas físicas de um nível (à direita, em cima). */
const CLOUD_SHADOW_LEVEL_SLOTS: u32 = CLOUD_SHADOW_PAGES_X * CLOUD_SHADOW_PAGES;

/** A página física da página global `g` do nível `k` no degrau `m` (endereço toroidal na janela do degrau). */
fn cloud_shadow_slot(k: u32, g: vec2i, m: u32) -> u32 {
    let n = vec2i(cloud_shadow_window_pages(m));
    let s = ((g % n) + n) % n;
    return k * CLOUD_SHADOW_LEVEL_SLOTS + u32(s.y) * CLOUD_SHADOW_PAGES_X + cloud_shadow_step_base(m) + u32(s.x);
}

/** Texel do canto da página física `slot` no atlas. */
fn cloud_shadow_slot_origin(slot: u32) -> vec2u {
    return vec2u(slot % CLOUD_SHADOW_SLOTS_X, slot / CLOUD_SHADOW_SLOTS_X) * CLOUD_SHADOW_STRIDE;
}

/** O nível de uma página física. */
fn cloud_shadow_slot_level(slot: u32) -> u32 {
    return slot / CLOUD_SHADOW_LEVEL_SLOTS;
}

/**
 * O degrau da página física `slot` nos mapas do quadro (`CLOUD_SHADOW_STEP_NONE`: fora deles — não é desenhada, provada
 * nem lida). As páginas físicas à direita a partir de 32 são do degrau ½; as primeiras, do de 0,2 ou (as 8 primeiras) do
 * de 1, que nunca estão juntos nos mapas (a troca entre eles, sem o degrau do meio, é de uma vez).
 */
fn cloud_shadow_slot_step(slot: u32, maps: CloudShadowMaps) -> u32 {
    let col = (slot % CLOUD_SHADOW_LEVEL_SLOTS) % CLOUD_SHADOW_PAGES_X;
    if (col >= cloud_shadow_step_base(1u)) {
        return select(CLOUD_SHADOW_STEP_NONE, 1u, maps.leaving == 1u || maps.entering == 1u);
    }
    if (maps.leaving == 2u || maps.entering == 2u) { return 2u; }
    if ((maps.leaving == 0u || maps.entering == 0u) && col < cloud_shadow_step_pages(0u)) { return 0u; }
    return CLOUD_SHADOW_STEP_NONE;
}

/** A página global que a janela do degrau `m` põe na página física `slot` (do degrau `m`). */
fn cloud_shadow_slot_page(slot: u32, m: u32) -> vec2i {
    let n = vec2i(cloud_shadow_window_pages(m));
    let k = cloud_shadow_slot_level(slot);
    let r = slot % CLOUD_SHADOW_LEVEL_SLOTS;
    let s = vec2i(i32(r % CLOUD_SHADOW_PAGES_X - cloud_shadow_step_base(m)), i32(r / CLOUD_SHADOW_PAGES_X));
    let w = cloud_shadow_window(k, m);
    return w + (((s - w) % n) + n) % n;
}

/**
 * Coordenadas (m) no plano do centro do texel `t` (0…16 por eixo, com a coluna da vizinha) da página `g` do nível `k` no
 * degrau `m`.
 */
fn cloud_shadow_texel_plane(k: u32, g: vec2i, t: vec2u, m: u32) -> vec2f {
    let gt = g * i32(CLOUD_SHADOW_PAGE) + vec2i(t);
    return (vec2f(gt) + 0.5) * cloud_shadow_step_texel(k, m);
}

/** O nível que cobre `x` (o menor, com a borda) e o peso do seguinte na faixa de mistura (os 8 % de fora). */
fn cloud_shadow_level(x: vec2f) -> vec2f {
    let c = abs(x - cloud_shadow_camera());
    let d = max(c.x, c.y);
    let u0 = cloud_shadow_usable(0u);
    let last = f32(CLOUD_SHADOW_LEVELS - 1u);
    var k = 0.0;
    if (d > u0) { k = min(ceil(log2(d / u0)), last); }
    if (k >= last) { return vec2f(last, 0.0); }
    let r = d / cloud_shadow_usable(u32(k));
    return vec2f(k, smoothstep(0.92, 1.0, r));
}

/** Hash inteiro (Wang/PCG) de uma palavra. */
fn cloud_shadow_hash1(v: u32) -> u32 {
    var x = v;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

/** O texel (em ordem de linha) da prova `j` da página física `slot` no quadro `frame`. */
fn cloud_shadow_probe_texel(slot: u32, frame: u32, j: u32) -> u32 {
    return cloud_shadow_hash1((slot * CLOUD_SHADOW_PROBES + j) * 0x9e3779b1u + frame * 0x85ebca6bu)
        % CLOUD_SHADOW_PAGE_TEXELS;
}

/** A base do plano para o sol `s` (a rotação mínima de +y ao sol, contínua até o nadir): a direita e em cima. */
fn cloud_shadow_basis(s: vec3f) -> mat2x3f {
    let k = 1.0 / max(1.0 + s.y, 1e-6);
    let right = vec3f(s.y + s.z * s.z * k, -s.x, -s.x * s.z * k);
    return mat2x3f(right, cross(s, right));
}
