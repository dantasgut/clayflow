// Mips da cópia da cena (spec 011, R6): cada nível é o anterior reduzido à metade por um filtro de 4 leituras
// bilineares (tenda 4×4) — o "borrão" que a rugosidade da refração lê. Um texel do nível de destino por invocação
// (despacho linear).
// Requer: WORKGROUP_SIZE; recursos `scene_mip_src` (o nível anterior), `scene_mip_dst` (o nível) e `scene_mip_sampler`.

@compute @workgroup_size(WORKGROUP_SIZE)
fn scene_copy_down(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let size = textureDimensions(scene_mip_dst);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let texel = vec2u(i % size.x, i / size.x);
    let uv = (vec2f(texel) + 0.5) / vec2f(size);
    let d = 0.5 / vec2f(size);
    let c = textureSampleLevel(scene_mip_src, scene_mip_sampler, uv + vec2f(-d.x, -d.y), 0.0)
        + textureSampleLevel(scene_mip_src, scene_mip_sampler, uv + vec2f(d.x, -d.y), 0.0)
        + textureSampleLevel(scene_mip_src, scene_mip_sampler, uv + vec2f(-d.x, d.y), 0.0)
        + textureSampleLevel(scene_mip_src, scene_mip_sampler, uv + vec2f(d.x, d.y), 0.0);
    textureStore(scene_mip_dst, texel, c * 0.25);
}
