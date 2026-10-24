// Instâncias da cena para a hierarquia de cima (spec 033, R1; A5): por instância, a matriz de mundo lida do pool
// `WorldTransform` pelo slot do registro (identidade para as esferas, já em mundo), a inversa, a caixa de mundo da
// hierarquia de baixo (os oito cantos da caixa da raiz dela) — guardada em `ray_aabbs` e reduzida na caixa do conjunto
// para os códigos de Morton da hierarquia de cima — e o material copiado do registro da entidade (as constantes do
// `StandardMaterial` e o slot da função, ou a cor constante das esferas dos sprites): quem sombreia os acertos não liga
// os pools de material.
// Requer: WORKGROUP_SIZE, NONE, ray_common, ray_reduce, build, ray_instance_sources, worlds, renderables, materials,
// ray_bvh_out, ray_aabbs.

/** Bit das instâncias com `StandardMaterial` (o registro aponta o pool dele). */
const RAY_MATERIAL_STANDARD: u32 = 0x80000000u;
/** Bit das instâncias de cor constante (`material.yzw`: o albedo; as esferas dos corpos de sprites). */
const RAY_MATERIAL_CONSTANT: u32 = 0x40000000u;

fn ray_store_matrix(word: u32, m: mat4x4f) {
    for (var c = 0u; c < 4u; c++) { ray_bvh_out[word + c].word = bitcast<vec4u>(m[c]); }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_instances_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    var box = array<vec3f, 2>(vec3f(RAY_MISS), vec3f(-RAY_MISS));
    if (i < build.count) { box = ray_instance_update(i); }
    ray_reduce_bounds(lid, box[0], box[1]);
}

/** Matrizes, material e caixa de mundo da instância `i` (guardada em `ray_aabbs`). */
fn ray_instance_update(i: u32) -> array<vec3f, 2> {
    let source = ray_instance_sources[i];
    let src = source.ids;
    var world = mat4x4f(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0));
    var inverse = affine_inverse(world);
    // A inversa de mundo calculada uma vez pelo estágio de transformação (spec 037).
    if (src.z != NONE) {
        world = worlds[src.z].world;
        inverse = world_inverses[src.z].inverse;
    }
    // `build.first`: palavra em que começa a região das hierarquias de baixo.
    let blas = ray_bvh_out[build.first + src.x * RAY_BLAS_WORDS].word;
    let rw = build.nodeFirst + blas.x * RAY_NODE_WORDS;
    let root = ray_node_words(ray_bvh_out[rw].word, ray_bvh_out[rw + 1u].word);
    var lo = vec3f(RAY_MISS);
    var hi = vec3f(-RAY_MISS);
    if (root.lo.x <= root.hi.x) {
        for (var k = 0u; k < 8u; k++) {
            let corner = vec3f(
                select(root.lo.x, root.hi.x, (k & 1u) != 0u),
                select(root.lo.y, root.hi.y, (k & 2u) != 0u),
                select(root.lo.z, root.hi.z, (k & 4u) != 0u),
            );
            let p = (world * vec4f(corner, 1.0)).xyz;
            lo = min(lo, p);
            hi = max(hi, p);
        }
    }
    // Material: as constantes do `StandardMaterial` (cinza médio fosco sem ele), a cor constante e o slot da função.
    let flags = source.material.x;
    var albedo = vec4f(0.5, 0.5, 0.5, 1.0);
    if ((flags & RAY_MATERIAL_CONSTANT) != 0u) { albedo = vec4f(bitcast<vec3f>(source.material.yzw), 1.0); }
    var roughness = 1.0;
    var metallic = 0.0;
    var fn_slot = NONE;
    if (src.y != NONE) {
        let r = renderables[src.y];
        fn_slot = r.fnSlot;
        if ((flags & RAY_MATERIAL_STANDARD) != 0u) {
            let m = materials[r.materialSlot];
            albedo = m.albedo;
            roughness = m.roughness;
            metallic = m.metallic;
        }
    }
    let w = build.primFirst + i * RAY_INSTANCE_WORDS;
    ray_store_matrix(w, inverse);
    ray_store_matrix(w + 4u, world);
    ray_bvh_out[w + 8u].word = vec4u(src.x, src.y, src.w, flags);
    ray_bvh_out[w + 9u].word = bitcast<vec4u>(vec4f(albedo.rgb, roughness));
    ray_bvh_out[w + 10u].word = vec4u(bitcast<u32>(metallic), fn_slot, 0u, 0u);
    ray_aabbs[i * 2u] = vec4f(lo, 0.0);
    ray_aabbs[i * 2u + 1u] = vec4f(hi, 0.0);
    return array<vec3f, 2>(lo, hi);
}
