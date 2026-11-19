// A sombra de uma superfície de altura pelo campo do colisor (spec 041, rodada 13): a geometria guardada uma vez numa
// estrutura que não depende da luz — o campo de alturas do `SurfaceCollider` e a pirâmide de máximos dele, refeitos só
// quando a superfície muda — e a visibilidade do disco da luz calculada por ponto contra ela. O sol andando não custa
// nada a mais.
//
// A marcha (Tevs, Ihrke e Seidel 2008, "Maximum mipmaps for fast, accurate, and scalable dynamic height field
// rendering"): do ponto na direção horizontal da luz, no espaço local do campo, a maior tangente do horizonte
// s = max (h(t) − y0)/t pelos níveis da pirâmide — a célula cujo máximo não passa de s · t (t na entrada dela) é saltada
// e sobe-se um nível; senão desce-se até as células de nó, onde a altura bilinear é lida no meio e na saída. Só importa
// s entre tan(e − r) e tan(e + r) (e a elevação da luz, r o raio angular do disco): começa em tan(e − r) e para em
// tan(e + r) (tapada). A visibilidade é a fração do disco acima do horizonte de elevação atan(s) (o segmento circular:
// x = (atan s − e)/r, (acos x − x·√(1 − x²))/π).
//
// O ponto na superfície (até meia célula abaixo da altura do campo: a malha desenhada e o campo são duas interpolações
// da mesma função) parte da altura do campo — o campo não tapa a si mesmo pela diferença entre as duas. Abaixo disso,
// do próprio ponto (tapado pelo que tem em cima).
//
// Teto de passos constante por invocação (`SURFACE_SHADOW_STEPS`, total: um laço só). Layout do campo:
// `surface_collider_hit.wgsl`; a pirâmide começa em `first + 62` (u32, relativo a `first`), o lado `P` em 63; o nível
// k (1…log2 P) em `(P² − (P >> (k − 1))²)/3`, `(P >> k)²` células.
// Requer: o recurso `surface_shadow_field`.

const SURFACE_SHADOW_STEPS: u32 = 256u;
const SURFACE_SHADOW_NO_HEIGHT: f32 = -1.0e38;

fn surface_shadow_f(i: u32) -> f32 {
    return surface_shadow_field[i];
}

fn surface_shadow_f3(i: u32) -> vec3f {
    return vec3f(surface_shadow_f(i), surface_shadow_f(i + 1u), surface_shadow_f(i + 2u));
}

/** Altura bilinear do campo (cópia em `base`, `nx` nós por linha) no ponto `g` da grade (nós). */
fn surface_shadow_height(base: u32, nx: u32, nz: u32, g: vec2f) -> f32 {
    let ix = min(u32(max(g.x, 0.0)), nx - 2u);
    let iz = min(u32(max(g.y, 0.0)), nz - 2u);
    let f = clamp(g - vec2f(f32(ix), f32(iz)), vec2f(0.0), vec2f(1.0));
    let b = base + 64u + ix + nx * iz;
    let h00 = surface_shadow_f(b);
    let h10 = surface_shadow_f(b + 1u);
    let h01 = surface_shadow_f(b + nx);
    let h11 = surface_shadow_f(b + nx + 1u);
    if (min(min(h00, h10), min(h01, h11)) <= SURFACE_SHADOW_NO_HEIGHT) { return SURFACE_SHADOW_NO_HEIGHT; }
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

/** Fração do disco de raio angular `r` (centro na elevação `e`) acima do horizonte de elevação `alpha`. */
fn surface_shadow_disk(alpha: f32, e: f32, r: f32) -> f32 {
    if (r <= 0.0) { return select(1.0, 0.0, alpha >= e); }
    let x = clamp((alpha - e) / r, -1.0, 1.0);
    return clamp((acos(x) - x * sqrt(max(1.0 - x * x, 0.0))) / 3.14159265358979, 0.0, 1.0);
}

/**
 * Visibilidade (0…1) do disco da luz de direção `l` (unitária, para a luz, mundo) e raio angular `r` no ponto `p` pela
 * superfície cujo campo começa em `first` no pool. Sem campo construído ou sem pirâmide: 1.
 */
fn surface_shadow_visibility(first: u32, p: vec3f, l: vec3f, r: f32) -> f32 {
    let built = bitcast<u32>(surface_shadow_f(first + 37u));
    let side = bitcast<u32>(surface_shadow_f(first + 63u));
    let nx = bitcast<u32>(surface_shadow_f(first + 56u));
    let nz = bitcast<u32>(surface_shadow_f(first + 58u));
    if (built == 0u || side < 2u || nx < 2u || nz < 2u) { return 1.0; }
    let pyr = first + bitcast<u32>(surface_shadow_f(first + 62u));
    let levels = countTrailingZeros(side);
    // A cópia do fim do quadro (a última construída).
    let base = first + (built - 1u) * bitcast<u32>(surface_shadow_f(first + 59u));
    let inv = mat4x4f(
        vec4f(surface_shadow_f3(base + 8u), surface_shadow_f(base + 11u)),
        vec4f(surface_shadow_f3(base + 12u), surface_shadow_f(base + 15u)),
        vec4f(surface_shadow_f3(base + 16u), surface_shadow_f(base + 19u)),
        vec4f(surface_shadow_f3(base + 20u), surface_shadow_f(base + 23u)),
    );
    let lo = surface_shadow_f3(base);
    let hi = surface_shadow_f3(base + 4u);
    let pl = (inv * vec4f(p, 1.0)).xyz;
    let dl = (inv * vec4f(l, 0.0)).xyz;
    let hl = length(dl.xz);
    // Luz a pino no espaço local: o campo de alturas não tapa quem está acima dele.
    if (hl <= 1e-6 * length(dl)) { return 1.0; }
    let e = atan2(dl.y, hl);
    let s_lo = tan(clamp(e - r, -1.5, 1.5));
    let s_hi = tan(clamp(e + r, -1.5, 1.5));
    let n = vec2f(f32(nx - 1u), f32(nz - 1u));
    let cell = max((hi - lo).xz / n, vec2f(1e-12));
    let g0 = (pl.xz - lo.xz) / cell;
    let ug = (dl.xz / hl) / cell;
    // A faixa do raio dentro da caixa [0, n] da grade.
    let inv_ug = vec2f(
        select(1e30, 1.0 / ug.x, abs(ug.x) > 1e-12),
        select(1e30, 1.0 / ug.y, abs(ug.y) > 1e-12),
    );
    let ta = (vec2f(0.0) - g0) * inv_ug;
    let tb = (n - g0) * inv_ug;
    let t_in = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), 0.0);
    let t_out = min(max(ta.x, tb.x), max(ta.y, tb.y));
    if (t_out <= t_in) { return 1.0; }
    // A origem: na superfície (até meia célula abaixo do campo), a altura do campo.
    var y0 = pl.y;
    if (all(g0 >= vec2f(0.0)) && all(g0 <= n)) {
        let hc = surface_shadow_height(base, nx, nz, g0);
        if (hc > SURFACE_SHADOW_NO_HEIGHT && pl.y >= hc - 0.5 * max(cell.x, cell.y)) { y0 = max(pl.y, hc); }
    }
    let eps = 2e-3 / max(abs(ug.x), abs(ug.y));
    var t = max(t_in, eps);
    var s = s_lo;
    var level = levels;
    for (var i = 0u; i < SURFACE_SHADOW_STEPS; i++) {
        if (t >= t_out) { break; }
        let gp = g0 + ug * t;
        let size = f32(1u << level);
        // A célula do nível (nó: as células entre nós; acima, as da pirâmide, `P >> level` por lado).
        let dims = select(vec2u(side >> level), vec2u(nx - 1u, nz - 1u), level == 0u);
        let c = min(vec2u(max(floor(gp / size), vec2f(0.0))), dims - vec2u(1u));
        let b0 = vec2f(c) * size;
        let b1 = b0 + vec2f(size);
        let tx = select(1e30, (select(b0.x, b1.x, ug.x > 0.0) - g0.x) * inv_ug.x, abs(ug.x) > 1e-12);
        let tz = select(1e30, (select(b0.y, b1.y, ug.y > 0.0) - g0.y) * inv_ug.y, abs(ug.y) > 1e-12);
        let t_exit = max(min(tx, tz), t);
        // Saindo da célula: um nível acima só quando a seguinte está noutra célula do pai.
        let next = t_exit + eps;
        let parent = 2.0 * size;
        let crossed = any(floor(gp / parent) != floor((g0 + ug * next) / parent));
        var top: f32;
        if (level == 0u) {
            let b = base + 64u + c.x + nx * c.y;
            top = max(
                max(surface_shadow_f(b), surface_shadow_f(b + 1u)),
                max(surface_shadow_f(b + nx), surface_shadow_f(b + nx + 1u)),
            );
        } else {
            let d = side >> (level - 1u);
            top = surface_shadow_f(pyr + (side * side - d * d) / 3u + c.x + (side >> level) * c.y);
        }
        if (top - y0 <= s * t) {
            // Nada nesta célula sobe o horizonte: a seguinte (um nível acima, se for de outro pai).
            t = next;
            if (crossed) { level = min(level + 1u, levels); }
            continue;
        }
        if (level > 0u) {
            level -= 1u;
            continue;
        }
        let te = min(t_exit, t_out);
        let tm = 0.5 * (t + te);
        let hm = surface_shadow_height(base, nx, nz, g0 + ug * tm);
        let he = surface_shadow_height(base, nx, nz, g0 + ug * te);
        if (hm > SURFACE_SHADOW_NO_HEIGHT) { s = max(s, (hm - y0) / tm); }
        if (he > SURFACE_SHADOW_NO_HEIGHT) { s = max(s, (he - y0) / te); }
        if (s >= s_hi) { return 0.0; }
        t = next;
        if (crossed) { level = 1u; }
    }
    return surface_shadow_disk(atan(s), e, r);
}
