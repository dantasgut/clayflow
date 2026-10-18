// Refração pela estrutura de raios (spec 034, R3), o segundo kernel: a luz da superfície vista pelo raio refratado — o
// material dela (`ray_hit_closure`, as funções `material` da cena) e a luz da cena (`scene_lighting`, o mesmo ponto do
// desenho: luzes, sombras, luz rebatida, cáusticas) mais a emissão —, vezes o quanto chega dela, somada ao que o
// primeiro kernel trouxe. Com dispersão, só a luz (a emissão por canal veio do primeiro kernel).
// Grava a radiância transmitida (`refraction_radiance`: rgb e, em a, a distância à primeira superfície).
// Requer: closure, closure_eval, ray_hit, scene_lighting, refraction_codec, refraction_frame e as texturas do primeiro
// kernel (sem pedido no pixel, a marca w < 0).

@compute @workgroup_size(8, 8, 1)
fn refraction_shade_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = textureDimensions(refraction_hit);
    if (gid.x >= size.x || gid.y >= size.y) { return; }
    let pixel = vec2i(gid.xy);
    let at = textureLoad(refraction_hit, pixel, 0);
    if (at.w < 0.0) { return; }
    let partial = textureLoad(refraction_partial, pixel, 0);
    var radiance = partial.rgb;
    if (at.w > 0.5) {
        let info = textureLoad(refraction_hit_info, pixel, 0);
        var hit: RayHit;
        hit.t = 0.0;
        hit.instance = info.y;
        hit.face = 1.0;
        hit.position = at.xyz;
        hit.normal = refraction_oct_decode(unpack2x16snorm(info.x));
        hit.uv = unpack2x16float(info.z);
        let v = refraction_oct_decode(unpack2x16snorm(info.w));
        let c = ray_hit_closure(hit, refraction_frame.time);
        var light = scene_lighting(c, hit.position, hit.normal, v);
        if (at.w < 1.5) { light += closure_emitted(c, hit.normal, v); }
        radiance += textureLoad(refraction_throughput, pixel, 0).rgb * light;
    }
    textureStore(refraction_radiance, pixel, vec4f(radiance, partial.a));
}
