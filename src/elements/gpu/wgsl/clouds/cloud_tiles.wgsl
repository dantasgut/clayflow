// A lista dos blocos da tela em que a composição das nuvens muda a cor (spec 041, T074): por bloco de `CLOUD_TILE`²
// pixels, entra se ele ou um vizinho (os 8 em volta) foi marcado pelo aumento (`cloud_upsample.wgsl`) — a nuvem
// passa-baixa da luz que chega (`sky_composite_cloud_low`: 3 × 3 leituras a 3 pixels, menos que um bloco) alcança o
// bloco ao lado. O bloco entra na lista (`cloud_tile_list_out`, empacotado x | y << 16) pela contagem atômica; o passe dos
// argumentos (`cloud_tile_args_main`) grava o despacho indireto da composição a partir dela. Numa sala fechada, zero
// blocos: a composição não roda.
// Requer: CLOUD_TILE, cloud_tiles (marcas), cloud_tile_list_out, cloud_tile_args, WORKGROUP_SIZE.

/** O máximo de grupos por dimensão de um despacho (`maxComputeWorkgroupsPerDimension` do núcleo). */
const CLOUD_TILE_GROUPS_MAX: u32 = 65535u;

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_tiles_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let tiles = vec2i(textureDimensions(cloud_tiles));
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= u32(tiles.x * tiles.y)) { return; }
    let tile = vec2i(i32(i % u32(tiles.x)), i32(i / u32(tiles.x)));
    var marked = 0u;
    for (var k = 0; k < 9; k++) {
        let q = tile + vec2i(k % 3 - 1, k / 3 - 1);
        if (all(q >= vec2i(0)) && all(q < tiles)) { marked |= textureLoad(cloud_tiles, q, 0).r; }
    }
    if (marked == 0u) { return; }
    let slot = atomicAdd(&cloud_tile_args[3], 1u);
    let w = u32(tiles.x);
    textureStore(cloud_tile_list_out, vec2u(slot % w, slot / w), vec4u(u32(tile.x) | (u32(tile.y) << 16u), 0u, 0u, 0u));
}

/** Os grupos do despacho indireto da composição: um por bloco da lista, em x até o teto e o resto em y. */
@compute @workgroup_size(1)
fn cloud_tile_args_main() {
    let count = atomicLoad(&cloud_tile_args[3]);
    atomicStore(&cloud_tile_args[0], min(count, CLOUD_TILE_GROUPS_MAX));
    atomicStore(&cloud_tile_args[1], (count + CLOUD_TILE_GROUPS_MAX - 1u) / CLOUD_TILE_GROUPS_MAX);
    atomicStore(&cloud_tile_args[2], 1u);
}
