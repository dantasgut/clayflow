// Luz ambiente das nuvens (spec 041, R9): a radiância média do céu no hemisfério de cima (a vista do céu, `WORKGROUP_SIZE` × 16
// direções estratificadas em espiral, reduzidas no grupo) e a do chão por baixo (o albedo do chão do `Sky` × a luz do
// sol transmitida pelo cosseno, mais o céu que ele recebe: `ρ/π·(E_sol + π·L_céu)`). Um grupo; texel (0, 0) o céu,
// (1, 0) o chão.
// Requer: WORKGROUP_SIZE (potência de 2), constants, sky_query, cloud_ambient_out.

const CLOUD_AMBIENT_PER_THREAD: u32 = 16u;

var<workgroup> cloud_ambient_sum: array<vec3f, WORKGROUP_SIZE>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_ambient_main(@builtin(local_invocation_index) li: u32) {
    let n = f32(WORKGROUP_SIZE * CLOUD_AMBIENT_PER_THREAD);
    var sum = vec3f(0.0);
    for (var k = 0u; k < CLOUD_AMBIENT_PER_THREAD; k++) {
        let i = f32(li * CLOUD_AMBIENT_PER_THREAD + k);
        // Hemisfério de cima uniforme em ângulo sólido: cos θ uniforme em (0, 1].
        let z = 1.0 - (i + 0.5) / n;
        let phi = i * PI * (3.0 - sqrt(5.0));
        let s = sqrt(max(0.0, 1.0 - z * z));
        sum += sky_radiance(vec3f(s * cos(phi), z, s * sin(phi)));
    }
    cloud_ambient_sum[li] = sum;
    workgroupBarrier();
    for (var stride = WORKGROUP_SIZE / 2u; stride > 0u; stride >>= 1u) {
        if (li < stride) { cloud_ambient_sum[li] += cloud_ambient_sum[li + stride]; }
        workgroupBarrier();
    }
    if (li == 0u) {
        let up = cloud_ambient_sum[0] / n;
        let mu = max(sky.sunDirection.y, 0.0);
        let sun = sky.sunIlluminance.rgb * sky_sun_transmittance(vec3f(0.0)) * mu;
        let down = sky.ground.rgb * (sun / PI + up);
        textureStore(cloud_ambient_out, vec2u(0u, 0u), vec4f(up, 1.0));
        textureStore(cloud_ambient_out, vec2u(1u, 0u), vec4f(down, 1.0));
    }
}
