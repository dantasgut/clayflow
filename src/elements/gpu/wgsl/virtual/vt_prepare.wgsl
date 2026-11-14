// Preparação da pirâmide das texturas virtuais (spec 034, T060c), no `VirtualTextureFlow`, um bloco por quadro: o bloco
// de até 1024² texels do nível L (`vt_prep_in`, RGBA8 na codificação da imagem, linha a linha, como a fonte o copiou)
// vira os níveis L + 1 a L + 10 do bloco (`vt_prep_out`, um após o outro, cada um com o lado do bloco no nível). Cada
// texel é a média 2 × 2 do nível anterior em luz linear (o sRGB decodificado; o alfa e a imagem linear como estão),
// recodificada em 8 bits — e o nível seguinte parte desse valor de 8 bits, como a referência. No lado ímpar, o par da
// borda repete o último texel (o índice preso no lado do nível). As duas etapas (o padrão do redutor de um passo da AMD,
// FidelityFX SPD, em dois despachos):
//   1. `vt_reduce_tiles_main` (até 32 × 32 grupos de 16 × 16, pelo índice linear): cada grupo reduz um ladrilho de 32² do bloco até um texel —
//      os níveis L + 1 a L + 5, na memória do grupo;
//   2. `vt_reduce_rest_main` (um grupo): o nível L + 5 do bloco (32²) até um texel — os níveis L + 6 a L + 10.
// Os pares 2x, 2x + 1 nunca cruzam ladrilho nem bloco (as origens são pares), e o índice preso não sai deles. Só os
// níveis até L + `count` são escritos. Laços com teto constante (os níveis). Referência:
// `material/virtual/reference/virtualTexture.ts` (`vtPyramid`). Requer: color, WORKGROUP_SIZE e os recursos `vt_prep`,
// `vt_prep_in` e `vt_prep_out`.

const VT_PREP_BLOCK: u32 = 1024u;
const VT_PREP_LEVELS: u32 = 10u;
/** Níveis reduzidos na memória do grupo por etapa (16 → 1). */
const VT_PREP_SHARED_LEVELS: u32 = 4u;

var<workgroup> vt_prep_shared: array<vec4f, 256>;

/** Linear (bit 0 de `origin.w`)? */
fn vt_prep_linear() -> bool {
    return vt_prep.origin.w != 0u;
}

/** Lado do nível L + k (o nível L dividido por 2^k, no mínimo 1). */
fn vt_prep_size(k: u32) -> vec2u {
    return max(vec2u(1u), vt_prep.size.xy >> vec2u(k));
}

/** A origem do bloco no nível L + k. */
fn vt_prep_origin(k: u32) -> vec2u {
    return vt_prep.origin.xy >> vec2u(k);
}

/** Lado do bloco no nível L + k na saída. */
fn vt_prep_side(k: u32) -> u32 {
    return VT_PREP_BLOCK >> k;
}

/** Primeira palavra do nível L + k (k ≥ 1) na saída. */
fn vt_prep_offset(k: u32) -> u32 {
    var offset = 0u;
    for (var j = 1u; j < VT_PREP_LEVELS; j++) {
        if (j >= k) { break; }
        offset += vt_prep_side(j) * vt_prep_side(j);
    }
    return offset;
}

/** O texel de 8 bits em luz linear. */
fn vt_prep_decode(p: u32) -> vec4f {
    let c = unpack4x8unorm(p);
    if (vt_prep_linear()) { return c; }
    return vec4f(srgb_decode(c.rgb), c.a);
}

/**
 * O valor de 8 bits de uma média sem curva (o alfa, a imagem linear): a média de quatro bytes cai em quartos, e o empate
 * em ½ sobe (o `Math.round` da referência) — a folga de 10⁻³ cobre o erro do f32 sem alcançar os outros quartos.
 */
fn vt_prep_byte(x: f32) -> u32 {
    return u32(floor(clamp(x, 0.0, 1.0) * 255.0 + 0.501));
}

/** A média em luz linear recodificada em 8 bits. */
fn vt_prep_encode(c: vec4f) -> u32 {
    let a = vt_prep_byte(c.a) << 24u;
    if (vt_prep_linear()) {
        return vt_prep_byte(c.r) | (vt_prep_byte(c.g) << 8u) | (vt_prep_byte(c.b) << 16u) | a;
    }
    return (pack4x8unorm(vec4f(srgb_encode(c.rgb), 0.0)) & 0xFFFFFFu) | a;
}

/** O texel (global) do nível L + k existe e entra na saída deste bloco? */
fn vt_prep_valid(k: u32, g: vec2u) -> bool {
    let local = g - vt_prep_origin(k);
    return k <= vt_prep.origin.z && all(g < vt_prep_size(k)) && all(g >= vt_prep_origin(k))
        && all(local < vec2u(vt_prep_side(k)));
}

/** Os dois índices (globais, no nível L + k − 1) dos filhos do texel `g` do nível L + k, presos no lado. */
fn vt_prep_children(k: u32, g: vec2u) -> array<vec2u, 2> {
    let last = vt_prep_size(k - 1u) - vec2u(1u);
    return array<vec2u, 2>(min(2u * g, last), min(2u * g + vec2u(1u), last));
}

/** Grava o texel `g` do nível L + k na saída e devolve o valor de 8 bits em luz linear. */
fn vt_prep_store(k: u32, g: vec2u, c: vec4f) -> vec4f {
    let p = vt_prep_encode(c);
    let local = g - vt_prep_origin(k);
    vt_prep_out[vt_prep_offset(k) + local.y * vt_prep_side(k) + local.x] = p;
    return vt_prep_decode(p);
}

/**
 * Os níveis `first` + 1 a `first` + 4 de um ladrilho a partir do nível `first` na memória do grupo (16², o texel (x, y)
 * em y · 16 + x): `tile` é a posição do ladrilho no nível `first` + 4 (em texels). Chamada por todo o grupo.
 */
fn vt_prep_shared_levels(first: u32, tile: vec2u, l: vec2u) {
    for (var s = 1u; s <= VT_PREP_SHARED_LEVELS; s++) {
        let k = first + s;
        let n = 16u >> s;
        // A origem do ladrilho no nível k e no anterior (globais).
        let base = vt_prep_origin(k) + tile * n;
        let prev = vt_prep_origin(k - 1u) + tile * (2u * n);
        var v = vec4f(0.0);
        let g = base + l;
        let live = all(l < vec2u(n)) && vt_prep_valid(k, g);
        if (live) {
            let ch = vt_prep_children(k, g);
            let a = ch[0] - prev;
            let b = ch[1] - prev;
            let stride = 2u * n;
            v = 0.25 * (vt_prep_shared[a.y * stride + a.x] + vt_prep_shared[a.y * stride + b.x]
                + vt_prep_shared[b.y * stride + a.x] + vt_prep_shared[b.y * stride + b.x]);
            v = vt_prep_store(k, g, v);
        }
        workgroupBarrier();
        if (all(l < vec2u(n))) { vt_prep_shared[l.y * n + l.x] = v; }
        workgroupBarrier();
    }
}

// ---- 1. os ladrilhos do bloco: os níveis L + 1 a L + 5 ----

@compute @workgroup_size(16, 16)
fn vt_reduce_tiles_main(
    @builtin(workgroup_id) wg: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_id) lid: vec3u,
) {
    // O ladrilho pelo índice linear do grupo (o despacho por `invocations`), linha a linha no bloco.
    let columns = (vt_prep.size.z + 31u) / 32u;
    let index = wg.x + wg.y * nwg.x;
    if (index >= columns * ((vt_prep.size.w + 31u) / 32u)) { return; }
    let tile = vec2u(index % columns, index / columns);
    let l = lid.xy;
    // O nível L + 1: os filhos no bloco de entrada (as linhas de `size.z` texels).
    let g = vt_prep_origin(1u) + tile * 16u + l;
    var v = vec4f(0.0);
    if (vt_prep_valid(1u, g)) {
        let ch = vt_prep_children(1u, g);
        let a = ch[0] - vt_prep.origin.xy;
        let b = ch[1] - vt_prep.origin.xy;
        let w = vt_prep.size.z;
        v = 0.25 * (vt_prep_decode(vt_prep_in[a.y * w + a.x]) + vt_prep_decode(vt_prep_in[a.y * w + b.x])
            + vt_prep_decode(vt_prep_in[b.y * w + a.x]) + vt_prep_decode(vt_prep_in[b.y * w + b.x]));
        v = vt_prep_store(1u, g, v);
    }
    vt_prep_shared[l.y * 16u + l.x] = v;
    workgroupBarrier();
    vt_prep_shared_levels(1u, tile, l);
}

// ---- 2. o resto: o nível L + 5 do bloco até um texel (os níveis L + 6 a L + 10) ----

@compute @workgroup_size(16, 16)
fn vt_reduce_rest_main(@builtin(local_invocation_id) lid: vec3u) {
    let l = lid.xy;
    let g = vt_prep_origin(6u) + l;
    var v = vec4f(0.0);
    if (vt_prep_valid(6u, g)) {
        let ch = vt_prep_children(6u, g);
        let a = ch[0] - vt_prep_origin(5u);
        let b = ch[1] - vt_prep_origin(5u);
        let o = vt_prep_offset(5u);
        let s = vt_prep_side(5u);
        v = 0.25 * (vt_prep_decode(vt_prep_out[o + a.y * s + a.x]) + vt_prep_decode(vt_prep_out[o + a.y * s + b.x])
            + vt_prep_decode(vt_prep_out[o + b.y * s + a.x]) + vt_prep_decode(vt_prep_out[o + b.y * s + b.x]));
        v = vt_prep_store(6u, g, v);
    }
    vt_prep_shared[l.y * 16u + l.x] = v;
    workgroupBarrier();
    vt_prep_shared_levels(6u, vec2u(0u), l);
}
