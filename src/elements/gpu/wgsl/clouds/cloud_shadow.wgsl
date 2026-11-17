// Mapa de profundidade ótica visto do sol (spec 041, R11): por texel da projeção ortográfica do sol centrada na câmera
// — coordenadas do plano do sol deformadas por `x = x0·sinh(2a·k)` (`clouds.sunWarp`: texels finos perto da câmera,
// crescendo com a distância como o pixel dela, até as nuvens do horizonte; em cima, com o sol baixo, a casca é uma faixa
// estreita do plano e a escala segue a altitude) —, o raio que desce do sol atravessa o primeiro trecho da casca com
// `CLOUD_SHADOW_STEPS` passos (teto constante), com a erosão das bordas; o texel guarda a profundidade ótica acumulada
// ao fim de cada um dos `CLOUD_SHADOW_KNOTS` trechos iguais (as camadas z = 0…3 do volume, quatro nós por camada) — os
// nós são da geometria (a casca), recalculados na leitura. Com o sol a 4°, o trecho tem ~35 km: quatro nós lineares (o
// desenho anterior) erravam τ em dezenas (medido no smoke `clouds`, `sunset`). O mapa inteiro a cada quadro: quem
// recebe a luz do sol lê o do quadro.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, cloud_common, cloud_density, clouds, cloud_shadow_out.

const CLOUD_SHADOW_STEPS: u32 = 64u;
const CLOUD_SHADOW_KNOTS: u32 = 16u;

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_shadow_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_shadow_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec2u(i % size.x, i / size.x);
    let a = (vec2f(g) + 0.5) / vec2f(size.xy) - 0.5;
    let w = clouds.sunWarp;
    let uv = vec2f(w.x * sinh(2.0 * a.x * w.y), w.z * sinh(2.0 * a.y * w.w));
    let sun = clouds.sunDir.xyz;
    let origin = clouds.sunFrame.xyz + clouds.sunRight.xyz * uv.x + clouds.sunUp.xyz * uv.y + sun * clouds.sunRight.w;
    let segs = cloud_shell_segments(origin, -sun, 1e9);
    var knots: array<f32, CLOUD_SHADOW_KNOTS>;
    if (segs.y > segs.x && sun.y > 0.0) {
        let dt = (segs.y - segs.x) / f32(CLOUD_SHADOW_STEPS);
        let per = CLOUD_SHADOW_STEPS / CLOUD_SHADOW_KNOTS;
        var tau = 0.0;
        for (var k = 0u; k < CLOUD_SHADOW_STEPS; k++) {
            let t = segs.x + (f32(k) + 0.5) * dt;
            tau += cloud_density(origin - sun * t, true) * clouds.layer.z * dt;
            if ((k + 1u) % per == 0u) { knots[(k + 1u) / per - 1u] = tau; }
        }
    }
    for (var l = 0u; l < CLOUD_SHADOW_KNOTS / 4u; l++) {
        let v = vec4f(knots[l * 4u], knots[l * 4u + 1u], knots[l * 4u + 2u], knots[l * 4u + 3u]);
        textureStore(cloud_shadow_out, vec3u(g, l), v);
    }
}
