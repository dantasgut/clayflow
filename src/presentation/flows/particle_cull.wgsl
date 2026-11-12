// O descarte das partículas pela GPU (spec 034, T060d): o predicado da compactação estável (`Compaction`) de um corpo —
// a partícula `i` do corpo fica na lista do desenho se a esfera dela (o raio do sprite) toca o tronco da vista e, com a
// hierarquia de profundidade deste quadro montada pelo desenho principal (`dc_hzb`, a série do `ForwardFlow`), não está
// escondida atrás do que ele desenhou. O valor é o índice da partícula no corpo; o sprite lê `particle_list[instância]`.
// Requer: cull_test, cameras, materials (PointSpriteMaterial), particles, pc_body, pc_cull_state, dc_hzb.

/** Palavras de `pc_body` (escritas pela CPU quando o corpo, o material, a câmera ou o descarte mudam). */
const PC_FIRST: u32 = 0u;
const PC_STRIDE: u32 = 1u;
const PC_POS: u32 = 2u;
const PC_MATERIAL: u32 = 3u;
const PC_CAMERA: u32 = 4u;
const PC_FLAGS: u32 = 5u;
const PC_HZB: u32 = 6u;
/** A hierarquia deste quadro vale (1): copiado pela CPU no fluxo de comandos, antes da compactação. */
const PC_HZB_VALID: u32 = 9u;
/** Bit de `PC_FLAGS`: o descarte desligado (`FrameTargets.culling`): todas as partículas entram, na ordem. */
const PC_KEEP_ALL: u32 = 1u;
/** O estado das medidas do descarte (`DC_STAT_STATE`) e o bit da hierarquia montada neste quadro (`DC_BUILD`). */
const PC_DC_STATE: u32 = 3u;
const PC_DC_BUILD: u32 = 1u;

fn compact_keep(i: u32) -> bool {
    if ((pc_body[PC_FLAGS] & PC_KEEP_ALL) != 0u) { return true; }
    let center = particles[(pc_body[PC_FIRST] + i) * pc_body[PC_STRIDE] + pc_body[PC_POS]].xyz;
    // Posição não finita (explosão numérica): o sprite não seria desenhado.
    if (!all(abs(center) < vec3f(1e30))) { return false; }
    let e = vec3f(materials[pc_body[PC_MATERIAL]].radius);
    let vp = cameras[pc_body[PC_CAMERA]].viewProjection;
    if (cull_outside(vp, center, e)) { return false; }
    // A oclusão só com a hierarquia montada neste quadro: `PC_HZB_VALID` diz que o desenho principal gravou a série
    // neste quadro (a CPU copia no fluxo de comandos), e o estado dele, que a GPU a montou.
    if (pc_body[PC_HZB_VALID] == 0u || (pc_cull_state[PC_DC_STATE] & PC_DC_BUILD) == 0u) { return true; }
    let r = hzb_rect(vec3u(pc_body[PC_HZB], pc_body[PC_HZB + 1u], pc_body[PC_HZB + 2u]), vp, center, e);
    if (!r.test) { return true; }
    let far = max(
        max(dc_hzb[r.offset + r.y.x * r.width + r.x.x], dc_hzb[r.offset + r.y.x * r.width + r.x.y]),
        max(dc_hzb[r.offset + r.y.y * r.width + r.x.x], dc_hzb[r.offset + r.y.y * r.width + r.x.y]),
    );
    return r.near <= far + CULL_DEPTH_BIAS;
}

fn compact_value(i: u32) -> u32 {
    return i;
}
