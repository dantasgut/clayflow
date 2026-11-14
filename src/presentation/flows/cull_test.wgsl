// O teste do descarte pela GPU (spec 034, T060d), comum ao desenho principal (`draw_cull.wgsl`) e às partículas
// (`particle_cull.wgsl`): o tronco da vista e o retângulo de uma caixa na hierarquia de profundidade (o nível e os 2 × 2
// texels a ler; cada consumidor lê a série `dc_hzb` que liga). `hzb` = (largura e altura do nível 0, níveis). As contas
// são as da referência `elements/render/reference/drawCull.ts`.
// Requer: viewSpace (ndc_to_uv).

/** Teto dos níveis da hierarquia (`HZB_LEVELS_MAX`). */
const HZB_LEVELS_MAX: u32 = 16u;
/** Abaixo deste `w` um canto está no plano da câmera ou atrás (`CULL_NEAR_W`). */
const CULL_NEAR_W: f32 = 1e-5;
/** Folga da profundidade no teste de oclusão (`CULL_DEPTH_BIAS`, 2⁻²⁰): a face da própria caixa não a esconde. */
const CULL_DEPTH_BIAS: f32 = 9.5367431640625e-7;

/** Os lados do nível `k` da hierarquia. */
fn hzb_level_size(hzb: vec3u, k: u32) -> vec2u {
    return max(vec2u(1u), hzb.xy >> vec2u(k));
}

/** A primeira posição do nível `k` (os níveis em sequência). */
fn hzb_level_offset(hzb: vec3u, k: u32) -> u32 {
    var offset = 0u;
    for (var j = 0u; j < HZB_LEVELS_MAX; j++) {
        if (j >= k) { break; }
        let s = hzb_level_size(hzb, j);
        offset += s.x * s.y;
    }
    return offset;
}

/** A caixa está toda fora de algum plano do tronco de `vp` (Gribb–Hartmann, profundidade em [0, 1]). */
fn cull_outside(vp: mat4x4f, c: vec3f, e: vec3f) -> bool {
    let r0 = vec4f(vp[0].x, vp[1].x, vp[2].x, vp[3].x);
    let r1 = vec4f(vp[0].y, vp[1].y, vp[2].y, vp[3].y);
    let r2 = vec4f(vp[0].z, vp[1].z, vp[2].z, vp[3].z);
    let r3 = vec4f(vp[0].w, vp[1].w, vp[2].w, vp[3].w);
    let planes = array<vec4f, 6>(r3 + r0, r3 - r0, r3 + r1, r3 - r1, r2, r3 - r2);
    for (var i = 0u; i < 6u; i++) {
        let n = planes[i];
        if (dot(n.xyz, c) + n.w + dot(abs(n.xyz), e) < 0.0) { return true; }
    }
    return false;
}

/**
 * O retângulo de uma caixa na hierarquia: `test` falso quando ela não pode ser escondida (um canto no plano da câmera
 * ou atrás, ou à frente do plano próximo); senão a profundidade mais perto dela (`near`) e os texels a ler — os 2 × 2
 * cantos `(x0|x1, y0|y1)` do nível em que o retângulo (aumentado de um texel do nível 0 de cada lado) cabe, a partir da
 * posição `offset` com `width` texels por linha.
 */
struct HzbRect {
    test: bool,
    near: f32,
    offset: u32,
    width: u32,
    x: vec2u,
    y: vec2u,
}

fn hzb_rect(hzb: vec3u, vp: mat4x4f, c: vec3f, e: vec3f) -> HzbRect {
    var out: HzbRect;
    out.test = false;
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    for (var i = 0u; i < 8u; i++) {
        let s = vec3f(
            select(-1.0, 1.0, (i & 1u) != 0u),
            select(-1.0, 1.0, (i & 2u) != 0u),
            select(-1.0, 1.0, (i & 4u) != 0u),
        );
        let clip = vp * vec4f(c + s * e, 1.0);
        if (clip.w <= CULL_NEAR_W) { return out; }
        let ndc = clip.xyz / clip.w;
        lo = min(lo, ndc);
        hi = max(hi, ndc);
    }
    if (lo.z <= 0.0) { return out; }
    // O retângulo em uv (y para baixo: o y mais alto em NDC é o v menor), em texels do nível 0 com a margem.
    let size0 = vec2f(hzb.xy);
    let a = clamp(ndc_to_uv(vec2f(lo.x, hi.y)), vec2f(0.0), vec2f(1.0)) * size0 - 1.0;
    let b = clamp(ndc_to_uv(vec2f(hi.x, lo.y)), vec2f(0.0), vec2f(1.0)) * size0 + 1.0;
    let span = max(max(b.x - a.x, b.y - a.y), 1.0);
    let level = min(hzb.z - 1u, u32(max(0.0, ceil(log2(span)))));
    let dims = hzb_level_size(hzb, level);
    let scale = f32(1u << level);
    out.x = vec2u(
        min(dims.x - 1u, u32(max(0.0, floor(a.x / scale)))),
        min(dims.x - 1u, u32(max(0.0, floor(b.x / scale)))),
    );
    out.y = vec2u(
        min(dims.y - 1u, u32(max(0.0, floor(a.y / scale)))),
        min(dims.y - 1u, u32(max(0.0, floor(b.y / scale)))),
    );
    out.offset = hzb_level_offset(hzb, level);
    out.width = dims.x;
    out.near = lo.z;
    out.test = true;
    return out;
}
