// Limites do domínio dos fluidos de partículas (spec 010). Com o domínio aberto (`ParticlePhysics.bounds: 'open'`), os
// planos do domínio não são paredes: a partícula que sai da caixa por baixo ou pelos lados é retirada — parada muito
// abaixo da cena (fora da grade de vizinhos, do enquadramento da água e da imagem). Acima do topo ela segue (volta a
// cair).

const FLUID_RETIRED_Y: f32 = -1.0e7;

/**
 * A partícula retirada (abaixo da cena: a que saiu do domínio aberto ou a gota que virou película, T066d) — com as
 * paredes do domínio ela não volta ao chão: segue retirada até a película a devolver num pingo.
 */
fn fluid_retired(p: vec3f) -> bool {
    return p.y < 0.5 * FLUID_RETIRED_Y;
}

fn fluid_outside(p: vec3f, lo: vec3f, hi: vec3f) -> bool {
    return p.y < lo.y || p.x < lo.x || p.z < lo.z || p.x > hi.x || p.z > hi.z;
}

// Planos do domínio que recebem adesão: os do chão e dos lados mínimos com paredes; nenhum com o domínio aberto.
fn fluid_adhesion_min(lo: vec3f, open: u32) -> vec3f {
    return select(lo, vec3f(-3.0e38), open != 0u);
}

// ── Gota solta (spec 034): a borda ancorada num sólido que a água molha ─────────────────────────────────────────────
// O ancoramento vem da superfície física do sólido (T066d: `ParticlePhysics.dropPinning`, a força de Furmidge da borda
// da gota de uma partícula — a histerese, a rugosidade e o ângulo de Young da `SurfacePhysics` dele), por entrada da
// tabela das superfícies (`collider_surfaces`; 0 a padrão, a das paredes do domínio).
// A partícula com poucas vizinhas representa gotas menores que a resolução, em que a borda da gota domina: ao longo do
// sólido mais próximo (`contact`, a normal e a distância), a velocidade é freada pelo ancoramento (`pinning`, m/s²,
// independente do aperto contra o sólido) e fica parada enquanto a gravidade ao longo dele for menor — no chão, depois
// do choque, espalha e para; na parede vertical, a gravidade rompe a borda e ela escorre. `contact_reach`: distância
// abaixo da qual a partícula está encostada.
// Gota solta ou volume (T066d): a contagem de vizinhas fluidas contra o limite tomado só na parte aberta da vizinhança —
// a calota da esfera de alcance `support` dentro do sólido mais próximo (`contact`) não tem vizinhas a contar. A
// partícula do volume encostada na parede tem a calota no sólido e o resto cheio de água: é volume, recebe a condição
// de parede do solver. A gota pousada tem a parte aberta vazia: segue gota, ancorada pela superfície.
fn fluid_loose_drop(count: u32, threshold: u32, contact: vec4f, support: f32) -> bool {
    if (threshold == 0u) { return false; }
    var open = 1.0;
    if (dot(contact.xyz, contact.xyz) > 0.25 && contact.w < support) {
        let x = clamp(contact.w / support, 0.0, 1.0);
        open = 1.0 - (1.0 - x) * (1.0 - x) * (2.0 + x) * 0.25;
    }
    return f32(count) < f32(threshold) * open;
}

/**
 * O estado da gota solta depois do passo (T066d), no lugar do ancoramento (a fronteira o grava de novo no passo
 * seguinte): `FLUID_DROP_SLIDING` na gota encostada que o ancoramento não parou — ela desliza pelo sólido, e o campo dos
 * fluidos a passa à película (a água abaixo da resolução das partículas; `FLUID_DROP_SLIDE_SPEED`); o ancoramento,
 * nas outras. Só a que o peso
 * não puxa para fora do sólido (`g` a gravidade: o chão, a rampa, a parede) — na face de baixo a gota pende ou cai, e a
 * película pende e pinga por conta própria — e que não se afasta dele mais do que anda ao longo dele.
 */
const FLUID_DROP_SLIDING: f32 = -1.0;
/**
 * Velocidade ao longo do sólido acima da qual a gota solta desliza (m/s): 1 cm/s — abaixo, é o tremor do solver na gota
 * pousada (a que a película devolveu parada no fundo de uma poça voltava a ela no quadro seguinte, e as duas trocavam a
 * água sem parar); a gota que a gravidade vence passa disso em poucos quadros.
 */
const FLUID_DROP_SLIDE_SPEED: f32 = 0.01;

fn fluid_drop_state(v: vec3f, g: vec3f, contact: vec4f, contact_reach: f32, pinning: f32) -> f32 {
    if (dot(contact.xyz, contact.xyz) <= 0.25 || contact.w >= contact_reach) { return pinning; }
    let n = normalize(contact.xyz);
    let vn = dot(v, n);
    let vt = length(v - vn * n);
    let pressed = dot(g, n) <= 0.01 * length(g);
    return select(pinning, FLUID_DROP_SLIDING, pressed && vt > FLUID_DROP_SLIDE_SPEED && vn < vt);
}

fn fluid_wet_pinning(v: vec3f, contact: vec4f, contact_reach: f32, pinning: f32, dt: f32) -> vec3f {
    if (dot(contact.xyz, contact.xyz) <= 0.25 || contact.w >= contact_reach) { return v; }
    let n = normalize(contact.xyz);
    let vn = dot(v, n) * n;
    let vt = v - vn;
    let speed = length(vt);
    if (speed <= 0.0) { return v; }
    return vn + vt * (max(0.0, speed - pinning * dt) / speed);
}
