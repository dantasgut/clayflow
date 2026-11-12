// A luz ou a cena que mudou (spec 034, T059, T060e; constituição VII): um grupo por quadro, antes dos raios. Compara as
// luzes do quadro (o pool `Light`) com as guardadas na série (`gi_change_previous`, a fatia do quadro anterior do canal
// temporal da spec 037) pela regra de `reference/change.ts` — o tipo, a sombra, a intensidade ou a cor mais de 3 %, a
// direção mais de 1° ou a posição mais de 1 cm, ou outra contagem de luzes — e abre `GI_CHANGE_FRAMES` quadros de
// resposta; o envio de um pool da cena no quadro (`gi.bounces.z`, do evento `poolWritten`) abre os mesmos quadros. A
// luz guardada só troca na mudança: o sol que anda devagar, abaixo das tolerâncias a cada quadro, muda quando se afasta
// da última guardada. Grava a fatia do quadro (`gi_change`): as contagens, as luzes guardadas e, na palavra 4, os
// quadros que faltam da resposta — que o `ProbeFlow` copia para `gi.bounces.z`, lido pelos acúmulos (`gi_response`).
// Requer: WORKGROUP_SIZE, gi, lights, LIGHT_LIMIT, GI_CHANGE_FRAMES, gi_change, gi_change_previous.

/** Palavras do cabeçalho: a resposta da luz e a da cena, a contagem guardada, a validade e a resposta do quadro. */
const GI_CHANGE_HEADER: u32 = 8u;
/** Palavras por luz guardada: o tipo, a sombra e a intensidade; a posição; a direção; a cor. */
const GI_CHANGE_LIGHT_WORDS: u32 = 16u;

var<workgroup> gi_change_moved: atomic<u32>;

fn gi_change_at(i: u32) -> u32 {
    return GI_CHANGE_HEADER + i * GI_CHANGE_LIGHT_WORDS;
}

/** `a` e `b` diferem mais de 3 % (relativo ao maior). */
fn gi_change_rel(a: f32, b: f32) -> bool {
    return abs(a - b) > 0.03 * max(max(abs(a), abs(b)), 1e-9);
}

fn gi_change_vec(at: u32) -> vec3f {
    return bitcast<vec3f>(vec3u(gi_change_previous[at], gi_change_previous[at + 1u], gi_change_previous[at + 2u]));
}

/** A luz `i` do quadro longe da guardada. */
fn gi_change_light_moved(i: u32) -> bool {
    let l = lights[i];
    let at = gi_change_at(i);
    if (gi_change_previous[at] != l.kind || gi_change_previous[at + 1u] != l.castShadow
        || gi_change_rel(bitcast<f32>(gi_change_previous[at + 2u]), l.intensity)) { return true; }
    let c = gi_change_vec(at + 12u);
    if (gi_change_rel(c.x, l.color.x) || gi_change_rel(c.y, l.color.y) || gi_change_rel(c.z, l.color.z)) { return true; }
    let d = gi_change_vec(at + 8u);
    let la = length(d);
    let lb = length(l.direction.xyz);
    if (la > 0.0 && lb > 0.0 && dot(d, l.direction.xyz) / (la * lb) < cos(PI / 180.0)) { return true; }
    return distance(gi_change_vec(at + 4u), l.position.xyz) > 0.01;
}

fn gi_change_store(at: u32, v: vec3f) {
    let u = bitcast<vec3u>(v);
    gi_change[at] = u.x;
    gi_change[at + 1u] = u.y;
    gi_change[at + 2u] = u.z;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_change_main(@builtin(local_invocation_index) lid: u32) {
    let count = min(min(gi.counts.x, arrayLength(&lights)), LIGHT_LIMIT);
    let valid = gi_change_previous[3] == 1u;
    let before = gi_change_previous[2];
    if (lid == 0u) { atomicStore(&gi_change_moved, select(0u, 1u, before != count || !valid)); }
    workgroupBarrier();
    for (var i = lid; i < min(count, before); i += WORKGROUP_SIZE) {
        if (gi_change_light_moved(i)) { atomicStore(&gi_change_moved, 1u); }
    }
    workgroupBarrier();
    let moved = atomicLoad(&gi_change_moved) != 0u;
    // As luzes guardadas: as do quadro na mudança; senão, as anteriores seguem.
    let kept = select(before, count, moved);
    for (var i = lid; i < kept; i += WORKGROUP_SIZE) {
        let at = gi_change_at(i);
        if (moved) {
            let l = lights[i];
            gi_change[at] = l.kind;
            gi_change[at + 1u] = l.castShadow;
            gi_change[at + 2u] = bitcast<u32>(l.intensity);
            gi_change_store(at + 4u, l.position.xyz);
            gi_change_store(at + 8u, l.direction.xyz);
            gi_change_store(at + 12u, l.color.xyz);
        } else {
            for (var w = 0u; w < GI_CHANGE_LIGHT_WORDS; w++) { gi_change[at + w] = gi_change_previous[at + w]; }
        }
    }
    if (lid != 0u) { return; }
    // A primeira guarda (sem luzes anteriores) não é mudança.
    let light = select(max(gi_change_previous[0], 1u) - 1u, select(0u, GI_CHANGE_FRAMES, valid), moved);
    let scene = select(max(gi_change_previous[1], 1u) - 1u, GI_CHANGE_FRAMES, gi.bounces.z != 0u);
    gi_change[0] = light;
    gi_change[1] = scene;
    gi_change[2] = kept;
    gi_change[3] = 1u;
    gi_change[4] = max(light, scene);
}
