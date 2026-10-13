// Estágio de transformação: compõe a matriz de mundo e a matriz de normais de cada slot
// a partir da intenção (posição, rotação, escala). Convenção M = T · R · S.
// Requer: structs Transform, WorldTransform, TransformParams; transform_local.

@group(0) @binding(0) var<storage, read>       transforms: array<Transform>;
@group(0) @binding(1) var<storage, read_write> worlds:     array<WorldTransform>;
@group(0) @binding(2) var<uniform>             params:     TransformParams;

@compute @workgroup_size(64)
fn transform_compose_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= params.count) { return; }
    let local = transform_local(transforms[i]);
    worlds[i].world = local.world;
    worlds[i].normal = local.normal;
}
