// A luz do céu nas superfícies sem iluminação global (spec 041): a radiância média do ambiente — o céu e o que o cobre
// (`scene_environment`: as nuvens pelo `sky_cover`) — no hemisfério de cima com peso do cosseno (a irradiância / π: o
// céu uniforme equivalente que o `closure_ambient` integra) e a do chão por baixo (o albedo do chão do `Sky` × (a luz do
// sol que chega ao chão pelo cosseno, sem as nuvens, mais a do céu) / π). `WORKGROUP_SIZE` × 16 direções em espiral,
// reduzidas no grupo; texel (0, 0) o céu, (1, 0) o chão. Um grupo.
// Requer: WORKGROUP_SIZE (potência de 2), constants, sky_query, scene_environment, sky_ambient_out.

const SKY_AMBIENT_PER_THREAD: u32 = 16u;

var<workgroup> sky_ambient_sum: array<vec3f, WORKGROUP_SIZE>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn sky_ambient_main(@builtin(local_invocation_index) li: u32) {
    let n = f32(WORKGROUP_SIZE * SKY_AMBIENT_PER_THREAD);
    var sum = vec3f(0.0);
    for (var k = 0u; k < SKY_AMBIENT_PER_THREAD; k++) {
        let i = f32(li * SKY_AMBIENT_PER_THREAD + k);
        // Cosseno: cos θ = sqrt(u) distribui pelo peso do cosseno (Malley).
        let z = sqrt(1.0 - (i + 0.5) / n);
        let phi = i * PI * (3.0 - sqrt(5.0));
        let s = sqrt(max(0.0, 1.0 - z * z));
        sum += scene_environment(vec3f(s * cos(phi), z, s * sin(phi)));
    }
    sky_ambient_sum[li] = sum;
    workgroupBarrier();
    for (var stride = WORKGROUP_SIZE / 2u; stride > 0u; stride >>= 1u) {
        if (li < stride) { sky_ambient_sum[li] += sky_ambient_sum[li + stride]; }
        workgroupBarrier();
    }
    if (li == 0u) {
        let up = sky_ambient_sum[0] / n;
        let mu = max(sky.sunDirection.y, 0.0);
        let sun = sky.sunIlluminance.rgb * sky_sun_transmittance(vec3f(0.0)) * mu;
        let down = sky.ground.rgb * (sun / PI + up);
        textureStore(sky_ambient_out, vec2u(0u, 0u), vec4f(up, 1.0));
        textureStore(sky_ambient_out, vec2u(1u, 0u), vec4f(down, 1.0));
    }
}
