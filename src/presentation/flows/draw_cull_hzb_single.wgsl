// O nível 0 da hierarquia de profundidade pela profundidade da cena sem amostras e os 4 níveis de cima do bloco (ver
// `draw_cull`). Os lados do nível 0 são múltiplos de 16: todas as invocações caem num texel.

@compute @workgroup_size(16, 16)
fn dc_hzb_base_single_main(
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(local_invocation_id) lid: vec3u,
    @builtin(workgroup_id) wid: vec3u,
) {
    let size = textureDimensions(dc_depth);
    let xr = dc_pixel_range(gid.x, dc.hzb.x, size.x);
    let yr = dc_pixel_range(gid.y, dc.hzb.y, size.y);
    var far = 0.0;
    if (xr.y - xr.x > DC_SPAN_MAX || yr.y - yr.x > DC_SPAN_MAX) {
        far = 1.0;
    } else {
        for (var j = 0u; j < DC_SPAN_MAX; j++) {
            let y = yr.x + j;
            if (y >= yr.y) { break; }
            for (var i = 0u; i < DC_SPAN_MAX; i++) {
                let x = xr.x + i;
                if (x >= xr.y) { break; }
                far = max(far, textureLoad(dc_depth, vec2u(x, y), 0));
            }
        }
    }
    dc_hzb_tile(lid.xy, wid.xy, far);
}
