// Composição das nuvens por compute sobre a lista dos blocos com nuvem (spec 041, T074; ver `sky_composite.wgsl`): um
// grupo por bloco de `CLOUD_TILE`² pixels da lista que o aumento e o passe da lista montaram na GPU (`cloud_tiles.wgsl`),
// pelo despacho indireto; cada invocação lê e escreve a cor do seu pixel (e a luz que chega, com o alvo dela):
// `final = cor·Tc + Sc`, pela mesma regra do passe de desenho. Fora dos blocos da lista a composição não muda a cor; o
// passe de desenho carregava e gravava a cor e a luz da tela inteira mesmo sem nuvem nenhuma à vista (a sala fechada).
// Requer: sky_composite_common, CLOUD_TILE, cloud_tile_list, cloud_tile_args_read, sky_composite_color,
// sky_composite_tile (o pixel, com ou sem a luz que chega).

@compute @workgroup_size(CLOUD_TILE * CLOUD_TILE)
fn sky_composite_tiles_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) li: u32,
) {
    let t = wid.x + wid.y * nwg.x;
    if (t >= cloud_tile_args_read[3]) { return; }
    let w = textureDimensions(cloud_tile_list).x;
    let packed = textureLoad(cloud_tile_list, vec2u(t % w, t / w), 0).r;
    let px = vec2u(packed & 0xFFFFu, packed >> 16u) * CLOUD_TILE + vec2u(li % CLOUD_TILE, li / CLOUD_TILE);
    let size = textureDimensions(sky_composite_color);
    if (any(px >= size)) { return; }
    let c = textureLoad(sky_composite_color, px);
    let rgb = sky_composite_tile(px, vec2i(size), sky_composite_cloud(px), c.rgb);
    textureStore(sky_composite_color, px, vec4f(rgb, c.a));
}
