// Caixas da hierarquia de baixo para cima (spec 033, R1): um despacho grava a caixa de cada folha — calculada do
// triângulo ou da esfera (`ray_prim_box`), ou lida de `ray_aabbs` (as instâncias da hierarquia de cima) — e o seguinte
// (`ray_climb_main`) sobe pelos pais: em cada nó interno, a segunda invocação a chegar (contador atômico, zerado antes
// por `ray_counters_clear_main`) junta as caixas dos dois filhos e continua — a primeira para. As caixas dos nós
// internos passam por um temporário atômico (`ray_boxes`: só as operações atômicas garantem que uma invocação de outro
// grupo veja a escrita); as das folhas já estão visíveis (despacho anterior). O nó recebe a caixa também por escrita
// comum, que os passos seguintes leem. Serve à construção e ao reajuste da geometria que se
// deforma (mesma topologia, caixas novas), sem reconstruir a hierarquia.
// Requer: WORKGROUP_SIZE, ray_common, ray_prim_box, build, ray_aabbs_read, ray_nodes_out, ray_parents_read,
// ray_counters, ray_boxes.

fn ray_refit_abs(local: u32) -> u32 {
    return build.nodeFirst + build.nodeBase + local;
}

fn ray_refit_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
}

/** Caixa do nó: no temporário atômico (para o irmão) e no nó (para os passos seguintes). */
fn ray_set_box(local: u32, lo: vec3f, hi: vec3f) {
    let k = local * 6u;
    atomicStore(&ray_boxes[k], bitcast<u32>(lo.x));
    atomicStore(&ray_boxes[k + 1u], bitcast<u32>(lo.y));
    atomicStore(&ray_boxes[k + 2u], bitcast<u32>(lo.z));
    atomicStore(&ray_boxes[k + 3u], bitcast<u32>(hi.x));
    atomicStore(&ray_boxes[k + 4u], bitcast<u32>(hi.y));
    atomicStore(&ray_boxes[k + 5u], bitcast<u32>(hi.z));
    let n = ray_refit_abs(local);
    ray_nodes_out[n].lo = vec4f(lo, ray_nodes_out[n].lo.w);
    ray_nodes_out[n].hi = vec4f(hi, ray_nodes_out[n].hi.w);
}

fn ray_box_lo(local: u32) -> vec3f {
    let k = local * 6u;
    return vec3f(bitcast<f32>(atomicLoad(&ray_boxes[k])), bitcast<f32>(atomicLoad(&ray_boxes[k + 1u])),
        bitcast<f32>(atomicLoad(&ray_boxes[k + 2u])));
}

fn ray_box_hi(local: u32) -> vec3f {
    let k = local * 6u + 3u;
    return vec3f(bitcast<f32>(atomicLoad(&ray_boxes[k])), bitcast<f32>(atomicLoad(&ray_boxes[k + 1u])),
        bitcast<f32>(atomicLoad(&ray_boxes[k + 2u])));
}

/** Primitiva local da folha j. */
fn ray_leaf_prim(j: u32) -> u32 {
    return bitcast<u32>(ray_nodes_out[ray_refit_abs(build.leaves - 1u + j)].hi.w);
}

/** Caixa de um filho: a da folha (escrita no passo anterior, comum) ou a do nó interno (atômica, deste passo). */
fn ray_child_lo(local: u32) -> vec3f {
    if (local + 1u >= build.leaves) { return ray_nodes_out[ray_refit_abs(local)].lo.xyz; }
    return ray_box_lo(local);
}

fn ray_child_hi(local: u32) -> vec3f {
    if (local + 1u >= build.leaves) { return ray_nodes_out[ray_refit_abs(local)].hi.xyz; }
    return ray_box_hi(local);
}

/** Grava a caixa de uma folha só no nó (lida pelo passo seguinte sem atômicos). */
fn ray_set_leaf(j: u32, lo: vec3f, hi: vec3f) {
    let n = ray_refit_abs(build.leaves - 1u + j);
    ray_nodes_out[n].lo = vec4f(lo, ray_nodes_out[n].lo.w);
    ray_nodes_out[n].hi = vec4f(hi, ray_nodes_out[n].hi.w);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_counters_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = ray_refit_index(gid3, nwg);
    if (i + 1u >= build.leaves) { return; }
    atomicStore(&ray_counters[i], 0u);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_leaves_aabbs_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = ray_refit_index(gid3, nwg);
    if (j >= build.leaves) { return; }
    let prim = ray_leaf_prim(j);
    ray_set_leaf(j, ray_aabbs[prim * 2u].xyz, ray_aabbs[prim * 2u + 1u].xyz);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_leaves_triangles_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = ray_refit_index(gid3, nwg);
    if (j >= build.leaves) { return; }
    let box = ray_leaf_triangles_box(ray_leaf_prim(j));
    ray_set_leaf(j, box[0], box[1]);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_leaves_spheres_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = ray_refit_index(gid3, nwg);
    if (j >= build.leaves) { return; }
    let box = ray_sphere_box(ray_leaf_prim(j));
    ray_set_leaf(j, box[0], box[1]);
}

/**
 * Subida das folhas (as caixas delas já gravadas): em cada nó interno, a segunda invocação a chegar junta as caixas dos
 * filhos e continua até a raiz.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_climb_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = ray_refit_index(gid3, nwg);
    if (j >= build.leaves || build.leaves == 1u) { return; }
    var node = ray_parents[build.nodeBase + build.leaves - 1u + j];
    loop {
        if (atomicAdd(&ray_counters[node], 1u) == 0u) { return; }
        let k = ray_refit_abs(node);
        let l = bitcast<u32>(ray_nodes_out[k].lo.w);
        let r = bitcast<u32>(ray_nodes_out[k].hi.w);
        ray_set_box(node, min(ray_child_lo(l), ray_child_lo(r)), max(ray_child_hi(l), ray_child_hi(r)));
        if (node == 0u) { return; }
        node = ray_parents[build.nodeBase + node];
    }
}
