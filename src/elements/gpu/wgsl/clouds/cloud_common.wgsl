// Nuvens volumétricas (spec 041): a casca entre a base e o topo da camada sobre o planeta do `Sky` (centro em
// (0, −R, 0), R = raio do chão da cena em metros), a altitude e a fração de altura de um ponto, o remapeamento e o
// perfil de altura por tipo (R5). Espelho de `elements/media/clouds/reference/cloudModel.ts`.
// Requer: clouds.

/** O intervalo [l0, h0] levado a [l1, h1], sem saturar. */
fn cloud_remap(v: f32, l0: f32, h0: f32, l1: f32, h1: f32) -> f32 {
    return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}

/** Altitude (m acima do chão da cena) do ponto `p`. */
fn cloud_altitude(p: vec3f) -> f32 {
    let r = clouds.shell.x;
    return length(vec3f(p.x, p.y + r, p.z)) - r;
}

/** Fração de altura na camada (fora de [0, 1] fora dela). */
fn cloud_height_fraction(p: vec3f) -> f32 {
    return (cloud_altitude(p) - clouds.shell.y) / max(clouds.shell.w, 1e-3);
}

/** Interseção com a esfera de raio `radius` (m do centro do planeta): (t0, t1), ou (1, −1) sem interseção. */
fn cloud_sphere(o: vec3f, d: vec3f, radius: f32) -> vec2f {
    let oc = vec3f(o.x, o.y + clouds.shell.x, o.z);
    let b = dot(oc, d);
    let c = dot(oc, oc) - radius * radius;
    let disc = b * b - c;
    if (disc < 0.0) { return vec2f(1.0, -1.0); }
    let s = sqrt(disc);
    return vec2f(-b - s, -b + s);
}

/**
 * Os trechos do raio dentro da casca até `t_max` e até o chão do planeta: `xy` o primeiro, `zw` o segundo (vazio quando
 * `z ≥ w`). Precisão: as distâncias ao centro do planeta (≈ 6,4·10⁶ m) em f32 erram ~0,5 m, abaixo do passo da marcha.
 */
fn cloud_shell_segments(o: vec3f, d: vec3f, t_max: f32) -> vec4f {
    let r = clouds.shell.x;
    let outer = cloud_sphere(o, d, r + clouds.shell.z);
    if (outer.x > outer.y) { return vec4f(0.0, 0.0, 0.0, 0.0); }
    let inner = cloud_sphere(o, d, r + clouds.shell.y);
    let ground = cloud_sphere(o, d, r);
    var end = t_max;
    if (ground.x <= ground.y && ground.x > 0.0) { end = min(end, ground.x); }
    let a = max(0.0, outer.x);
    let b = min(end, outer.y);
    if (b <= a) { return vec4f(0.0, 0.0, 0.0, 0.0); }
    if (inner.x > inner.y || inner.y <= a || inner.x >= b) { return vec4f(a, b, 0.0, 0.0); }
    var s0 = vec2f(0.0);
    var s1 = vec2f(0.0);
    if (inner.x > a) { s0 = vec2f(a, min(inner.x, b)); }
    if (inner.y < b) {
        let seg = vec2f(max(inner.y, a), b);
        if (s0.y > s0.x) { s1 = seg; } else { s0 = seg; }
    }
    return vec4f(s0, s1);
}

/**
 * A distância (m), na direção `sun` (para o sol), do ponto `q` até a saída do topo da casca do lado do sol: a origem do
 * raio que desce do sol pela coluna de `q` no mapa visto do sol, com o sol acima ou abaixo do horizonte. 0 quando a
 * coluna não cruza o topo da casca ou o cruza só do outro lado.
 */
fn cloud_sun_entry(q: vec3f, sun: vec3f) -> f32 {
    let s = cloud_sphere(q, sun, clouds.shell.x + clouds.shell.z);
    if (s.x > s.y) { return 0.0; }
    return max(s.y, 0.0) + 1.0;
}

/** Limites [subida0, subida1, descida0, descida1] do perfil no tipo `t` (estrato 0 → cúmulo 0,5 → cúmulo-nimbo 1). */
fn cloud_profile_limits(t: f32) -> vec4f {
    let stratus = vec4f(0.0, 0.1, 0.2, 0.3);
    let cumulus = vec4f(0.0, 0.25, 0.6, 0.95);
    let nimbus = vec4f(0.0, 0.1, 0.8, 1.0);
    let tt = clamp(t, 0.0, 1.0);
    if (tt <= 0.5) { return mix(stratus, cumulus, tt * 2.0); }
    return mix(cumulus, nimbus, tt * 2.0 - 1.0);
}

/** O perfil de altura: a rampa de subida na base × a de descida no topo. */
fn cloud_height_profile(h: f32, t: f32) -> f32 {
    if (h < 0.0 || h > 1.0) { return 0.0; }
    let l = cloud_profile_limits(t);
    return smoothstep(l.x, l.y, h) * (1.0 - smoothstep(l.z, l.w, h));
}

/**
 * A água da torre (spec 041, R19): o fator da extinção na altitude `alt` (m acima do chão) pela água condensada. No
 * cúmulo de tempo bom a densidade 1 é a extinção da camada; acima do topo do tempo bom (`fair`, m acima do chão), a torre
 * do cúmulo-nimbo condensa mais (a água adiabática cresce com a altura acima da base: ~1–3 g/m³ no núcleo de um
 * cúmulo-nimbo contra ~0,3–0,5 no cúmulo raso) — o fator sobe de 1 a 1 + `CLOUD_WATER_GAIN` nos `CLOUD_WATER_DEPTH`
 * metros acima dele — e, da glaciação em diante (−20 °C a −38 °C: 5,5–8,5 km na atmosfera padrão), a água vira gelo de
 * cristais maiores e o fator volta a 1. Sem o tempo, o topo do tempo bom é o da casca: o fator é 1 em toda parte.
 * Espelho de `towerWater` em `cloudModel.ts`.
 */
const CLOUD_WATER_GAIN: f32 = 2.0;
const CLOUD_WATER_DEPTH: f32 = 3000.0;
const CLOUD_GLACIATION_LOW: f32 = 5500.0;
const CLOUD_GLACIATION_HIGH: f32 = 8500.0;

fn cloud_tower_water(alt: f32, fair: f32) -> f32 {
    let liquid = 1.0 + CLOUD_WATER_GAIN * clamp((alt - fair) / CLOUD_WATER_DEPTH, 0.0, 1.0);
    return mix(liquid, 1.0, smoothstep(CLOUD_GLACIATION_LOW, CLOUD_GLACIATION_HIGH, alt));
}

/**
 * A bigorna do cúmulo-nimbo (spec 041, R19): o ar da torre para no nível de equilíbrio (a tropopausa, o topo da casca),
 * sai para os lados e é levado pelo vento da alta troposfera — uma lâmina de gelo de `CLOUD_ANVIL_DEPTH` metros com o
 * topo `CLOUD_ANVIL_CEILING` metros abaixo da tropopausa (as torres mais fortes passam acima dela: o topo saliente). Os
 * cristais de gelo (IWC ~0,1 g/m³, raio efetivo ~30 µm) extinguem `CLOUD_ANVIL_WATER` da extinção da camada.
 * Espelho de `CLOUD_ANVIL` e `anvilProfile` em `cloudModel.ts`.
 */
const CLOUD_ANVIL_DEPTH: f32 = 2000.0;
const CLOUD_ANVIL_CEILING: f32 = 800.0;
const CLOUD_ANVIL_WATER: f32 = 0.25;

/** O perfil vertical da bigorna na altitude `alt` (m) com a tropopausa `top` (m): base plana, topo arredondado. */
fn cloud_anvil_profile(alt: f32, top: f32) -> f32 {
    let x = (alt - (top - CLOUD_ANVIL_CEILING - CLOUD_ANVIL_DEPTH)) / CLOUD_ANVIL_DEPTH;
    if (x <= 0.0 || x >= 1.0) { return 0.0; }
    return smoothstep(0.0, 0.25, x) * (1.0 - smoothstep(0.7, 1.0, x));
}

/**
 * A fração do caminho entre o topo do tempo bom e o topo do tempo a que a torre de tipo local `t` sobe (spec 041, R19):
 * a convecção profunda não sobe por igual — as células mais fortes (tipo local ≥ 0,95) vão à tropopausa, as de tipo 0,55
 * ficam no topo do tempo bom (cúmulos congestos entre elas). Espelho de `towerReach` em `cloudModel.ts`.
 */
fn cloud_tower_reach(t: f32) -> f32 {
    return smoothstep(0.55, 0.95, t);
}
