// Refração pela estrutura de raios (spec 034, R3), a luz: a superfície vista pelo raio refratado — o material dela
// (`ray_hit_closure`, as funções `material` da cena) e a luz da cena (`scene_lighting`, o mesmo ponto do desenho: luzes,
// sombras, luz rebatida, cáusticas) mais a emissão —, vezes o quanto chega dela, somada ao que o caminho trouxe. Com
// dispersão, só a luz (a emissão por canal veio do caminho). Uma função dos valores gravados pelo caminho: serve à
// amostra do centro (`refraction_shade_main.wgsl`) e às extras do antisserrilhado (`refraction_samples.wgsl`).
// Requer: closure, closure_eval, ray_hit, scene_lighting, refraction_codec, refraction_frame.

/** A radiância de uma amostra: `partial` (o caminho), `at` (a superfície e a marca), `info` e `throughput`. */
fn refraction_shade_values(partial: vec4f, at: vec4f, info: vec4u, throughput: vec3f) -> vec3f {
    var radiance = partial.rgb;
    if (at.w > 0.5) {
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
        radiance += throughput * light;
    }
    return radiance;
}
