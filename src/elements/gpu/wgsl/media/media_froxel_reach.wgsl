// O alcance da câmera (spec 041, R21): no fim do quadro, a maior profundidade da cena (o fundo, sem superfície: 1) — cada
// invocação lê um bloco de `FROXEL_REACH_BLOCK`² pixels, o máximo do grupo pela redução em árvore e o do quadro por
// `atomicMax` (um por grupo; o f32 positivo tem a ordem do u32) — e, na invocação final, a distância dela pelo canto da
// tela mais longe (um limite de cima da distância vista) e a decisão do meio contínuo no quadro seguinte: conta com névoa
// dos volumes ou com a profundidade ótica do ar no caminho mais longo (a extinção do meio na câmera × a distância) acima
// de `FROXEL_REACH_TAU` — abaixo dela a luz dele fica abaixo de 0,1 % da do caminho, e os froxels não o refazem (a tabela
// do `Sky` soma tudo). O texel do canal: (alcance, decisão do seguinte, decisão deste, 0).
// Requer: WORKGROUP_SIZE, froxels, cameras, media_common, media_froxel_state, scene_medium_open,
// froxel_reach_depth_at, froxel_reach_max, froxel_reach_out.

const FROXEL_REACH_TAU: f32 = 1e-3;
/** A distância do fundo (sem superfície). */
const FROXEL_REACH_SKY: f32 = 3.0e38;
/** Lado do bloco de pixels de cada invocação. */
const FROXEL_REACH_BLOCK: u32 = 4u;

var<workgroup> froxel_reach_group: array<f32, WORKGROUP_SIZE>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn froxel_reach_reduce_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_index) lid: u32,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let size = froxel_reach_depth_size();
    let blocks = (size + FROXEL_REACH_BLOCK - 1u) / FROXEL_REACH_BLOCK;
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    // Sem retorno antes das barreiras: a invocação fora da imagem entra com 0.
    var z = 0.0;
    if (i < blocks.x * blocks.y) {
        let base = vec2u(i % blocks.x, i / blocks.x) * FROXEL_REACH_BLOCK;
        for (var k = 0u; k < FROXEL_REACH_BLOCK * FROXEL_REACH_BLOCK; k++) {
            let px = base + vec2u(k % FROXEL_REACH_BLOCK, k / FROXEL_REACH_BLOCK);
            if (all(px < size)) { z = max(z, froxel_reach_depth_at(px)); }
        }
    }
    froxel_reach_group[lid] = z;
    workgroupBarrier();
    for (var s = WORKGROUP_SIZE / 2u; s > 0u; s >>= 1u) {
        if (lid < s) { froxel_reach_group[lid] = max(froxel_reach_group[lid], froxel_reach_group[lid + s]); }
        workgroupBarrier();
    }
    if (lid == 0u) { atomicMax(&froxel_reach_max[0], bitcast<u32>(froxel_reach_group[0])); }
}

@compute @workgroup_size(1)
fn froxel_reach_final_main() {
    let z = bitcast<f32>(atomicLoad(&froxel_reach_max[0]));
    atomicStore(&froxel_reach_max[0], 0u);
    let cam = cameras[froxels.grid.w];
    var d = FROXEL_REACH_SKY;
    if (z < 1.0) {
        // A maior profundidade nos quatro cantos da tela: a distância até ela no canto mais esticado (de cima).
        d = 0.0;
        for (var k = 0u; k < 4u; k++) {
            let ndc = vec2f(select(-1.0, 1.0, (k & 1u) != 0u), select(-1.0, 1.0, (k & 2u) != 0u));
            let w = cam.inverseUnjitteredViewProjection * vec4f(ndc, z, 1.0);
            d = max(d, distance(w.xyz / w.w, cam.position.xyz));
        }
    }
    let e = scene_medium_open(cam.position.xyz, vec3f(0.0, 1.0, 0.0)).extinction;
    let next = froxels.counts.x > 0u || max(e.r, max(e.g, e.b)) * d > FROXEL_REACH_TAU;
    let now = froxel_medium_state().x;
    textureStore(froxel_reach_out, vec2u(0u), vec4f(d, select(0.0, 1.0, next), select(0.0, 1.0, now), 0.0));
}
