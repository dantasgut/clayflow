// A névoa no desenho (spec 033, R12; ponto `scene_fog`): os froxels integrados guardam, no texel da fatia k, a luz
// espalhada para a câmera e a transmitância do caminho da câmera até o fim da fatia. A leitura é tricúbica (B-spline
// por 8 leituras trilineares): sem os degraus da grade nem blocos. Antes do fim da primeira fatia, a fração dela.
// Requer: froxels, cameras, media_common, froxel_scatter, froxel_sampler.

/** B-spline cúbica 3D por 8 leituras trilineares (Sigg e Hadwiger). */
fn froxel_tricubic(uvw: vec3f) -> vec4f {
    let size = vec3f(textureDimensions(froxel_scatter));
    let g = uvw * size - 0.5;
    let i = floor(g);
    let f = g - i;
    let f2 = f * f;
    let f3 = f2 * f;
    let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
    let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
    let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
    let w3 = f3 / 6.0;
    let s0 = w0 + w1;
    let s1 = w2 + w3;
    let c0 = (i - 0.5 + w1 / s0) / size;
    let c1 = (i + 1.5 + w3 / s1) / size;
    var sum = vec4f(0.0);
    for (var k = 0u; k < 8u; k++) {
        let o = vec3<bool>((k & 1u) != 0u, (k & 2u) != 0u, (k & 4u) != 0u);
        let c = select(c0, c1, o);
        let w = select(s0, s1, o);
        sum += textureSampleLevel(froxel_scatter, froxel_sampler, c, 0.0) * (w.x * w.y * w.z);
    }
    return sum;
}

fn scene_fog(p: vec3f) -> vec4f {
    let none = vec4f(0.0, 0.0, 0.0, 1.0);
    if (froxels.depth.w == 0.0) { return none; }
    let cam = cameras[froxels.grid.w];
    let f = froxel_locate(cam.view, cam.viewProjection, p);
    if (f.z <= 0.0) { return none; }
    let n = f32(froxels.grid.z);
    let fog = froxel_tricubic(vec3f(f.xy, clamp((f.z - 0.5) / n, 0.5 / n, 1.0 - 0.5 / n)));
    return select(fog, mix(none, fog, f.z), f.z < 1.0);
}
