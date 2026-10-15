// Um nível da hierarquia de Transform (spec 007, research R12): para cada elo do nível, a matriz de mundo do filho é a
// do pai — já composta neste quadro pelo nível anterior — composta com a local dele: world = world[pai] · T · R · S
// (e normal = normal[pai] · normal local). Filho com função `transform` (spec 009; bit 31 de `child`): a local é a que
// a função escreveu em `worlds` neste quadro, antes dos níveis.
// Requer: structs Transform, WorldTransform, TransformLink, TransformLevel; transform_local.

@group(0) @binding(0) var<storage, read>       transforms: array<Transform>;
@group(0) @binding(1) var<storage, read_write> worlds:     array<WorldTransform>;
@group(0) @binding(2) var<storage, read>       links:      array<TransformLink>;
@group(0) @binding(3) var<uniform>             level:      TransformLevel;

@compute @workgroup_size(64)
fn transform_link_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let k = gid3.x + gid3.y * nwg.x * 64u;
    if (k >= level.count) { return; }
    let link = links[level.first + k];
    let child = link.child & 0x7fffffffu;
    var local: WorldTransform;
    if ((link.child & 0x80000000u) != 0u) {
        local = worlds[child];
    } else {
        local = transform_local(transforms[child]);
    }
    let parent = worlds[link.parent];
    worlds[child].world = parent.world * local.world;
    worlds[child].normal = parent.normal * local.normal;
}
