// Cache de espalhamento das nuvens (spec 041, T023, R8): o transporte não local da luz na camada. Cada invocação é uma
// sonda da grade (`cloud_scatter_lookup`): lê a fatia anterior da série (a soma e a contagem dos caminhos), e nos
// quadros em que é a vez do grupo dela (um a cada `clouds.scatterWork.x`) e há nuvem em volta (a forma sem o detalhe na
// sonda ou nas seis vizinhas), soma um caminho aleatório — rastreamento delta (Novák 2018) no meio com o pico de frente
// truncado (δ-M), o próximo evento ao sol em cada colisão pelo mapa visto do sol, o céu ao sair por cima, o chão (com a
// sombra das nuvens) ao sair por baixo — que estima a luz que chega à sonda espalhada pela fase na direção da câmera.
// A média tem janela `clouds.scatterParams.y` caminhos; o histórico recomeça no corte da câmera, quando a série não vale
// ou quando o centro da grade muda, e esquece na proporção do ângulo que o sol andou desde o quadro anterior (a série
// `cloud_scatter_sun`: `e^(−Δ/CLOUD_SCATTER_SUN_MEMORY)`; o sol parado não esquece). A marcha soma o espalhamento simples
// exato e esta luz × σs.
// Teto constante: `CLOUD_SCATTER_STEPS` passos por caminho (nulos, reais e saltos) e `CLOUD_PHASE_TRIES` tentativas em
// cada amostra da fase — o orçamento total por invocação é `CLOUD_SCATTER_STEPS × (1 + 2·CLOUD_PHASE_TRIES)`.
// Despacho linear: uma sonda por invocação.
// Requer: WORKGROUP_SIZE, constants, random, cloud_common, cloud_sun, cloud_density, cloud_phase, cloud_shadow_lookup,
// cloud_scatter_grid, sky_query, clouds, cameras, cloud_ambient_tex, cloud_scatter_prev, cloud_scatter_out,
// cloud_scatter_sun_prev, cloud_scatter_sun_out.

const CLOUD_SCATTER_STEPS: u32 = 256u;
const CLOUD_SCATTER_COLLISIONS: u32 = 48u;
const CLOUD_PHASE_TRIES: u32 = 8u;
const RANDOM_STREAM_CLOUD_SCATTER: u32 = RANDOM_STREAM_USER + 41u;
/** Ângulo (rad) do sol que reduz a média das sondas a 1/e: 0,25° (o sol que anda depressa cai nas oitavas, sem o ruído de poucos caminhos). */
const CLOUD_SCATTER_SUN_MEMORY: f32 = 0.0043633231;

fn cloud_scatter_rand(state: ptr<function, u32>) -> f32 {
    return random_unit(random_next(state));
}

/** A direção com o cosseno `c` em volta de `w` e o azimute `phi`. */
fn cloud_scatter_rotate(w: vec3f, c: f32, phi: f32) -> vec3f {
    let a = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(w.x) > 0.9);
    let t = normalize(cross(a, w));
    let b = cross(w, t);
    let s = sqrt(max(0.0, 1.0 - c * c));
    return normalize(t * (s * cos(phi)) + b * (s * sin(phi)) + w * c);
}

/** Cosseno da fase truncada: a HG pela inversa restrita ao lado de fora do corte; Draine por rejeição (teto constante). */
fn cloud_scatter_sample_cos(state: ptr<function, u32>) -> f32 {
    let cut = clouds.phaseCut;
    let p = clouds.phase;
    if (cloud_scatter_rand(state) < cut.z) {
        let g = p.x;
        let q = cloud_scatter_rand(state) * cut.w * 2.0 * g / (1.0 - g * g) + 1.0 / (1.0 + g);
        return clamp((1.0 + g * g - 1.0 / (q * q)) / (2.0 * g), -1.0, cut.x);
    }
    let g = p.y;
    var mu = 0.0;
    for (var k = 0u; k < CLOUD_PHASE_TRIES; k++) {
        let s = (1.0 - g * g) / (1.0 - g + 2.0 * g * cloud_scatter_rand(state));
        mu = clamp((1.0 + g * g - s * s) / (2.0 * g), -1.0, 1.0);
        let accept = (1.0 + p.z * mu * mu) / (1.0 + p.z);
        if (mu <= cut.x && cloud_scatter_rand(state) < accept) { return mu; }
    }
    return min(mu, cut.x);
}

fn cloud_scatter_direction(d: vec3f, state: ptr<function, u32>) -> vec3f {
    let c = cloud_scatter_sample_cos(state);
    return cloud_scatter_rotate(d, c, 2.0 * PI * cloud_scatter_rand(state));
}

/** A radiância do chão no ponto `pg` (Lambert): o sol com a sombra das nuvens (meio truncado) e o céu. */
fn cloud_scatter_ground(pg: vec3f, k_t: f32) -> vec3f {
    let sun = sky.sunDirection.xyz;
    let t = exp(-cloud_shadow_depth(pg) * k_t);
    let e = sky.sunIlluminance.rgb * sky_sun_transmittance(pg) * max(sun.y, 0.0) * t;
    let up = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb;
    return sky.ground.rgb * (e / PI + up);
}

/** Um caminho da sonda `x0` com a câmera na direção `dcam` (espelho de `scatterWalk`). */
fn cloud_scatter_walk(x0: vec3f, dcam: vec3f, collisions: u32, state: ptr<function, u32>) -> vec3f {
    let cut = clouds.phaseCut;
    let albedo = clouds.layer.w;
    let k_t = 1.0 - albedo * cut.y;
    let albedo_t = albedo * (1.0 - cut.y) / k_t;
    let majorant = clouds.layer.z * k_t;
    let r = clouds.shell.x;
    let top = clouds.shell.z;
    let base = clouds.shell.y;
    let sun = sky.sunDirection.xyz;
    var d = dcam;
    if (cloud_scatter_rand(state) >= cut.y) { d = cloud_scatter_direction(dcam, state); }
    var x = x0;
    var thr = 1.0;
    var light = vec3f(0.0);
    var hits = 0u;
    let n = min(collisions, CLOUD_SCATTER_COLLISIONS);
    for (var s = 0u; s < CLOUD_SCATTER_STEPS; s++) {
        let alt = cloud_altitude(x);
        let up = normalize(vec3f(x.x, x.y + r, x.z));
        let rising = dot(up, d);
        if (alt >= top) {
            if (rising >= 0.0) { return light + thr * sky_radiance(d); }
            let span = cloud_sphere(x, d, r + top);
            if (span.x > span.y) { return light + thr * sky_radiance(d); }
            x = x + d * (span.x + 1e-2);
            continue;
        }
        if (alt <= base) {
            if (rising < 0.0) {
                let g = cloud_sphere(x, d, r);
                if (g.x <= g.y && g.x > 0.0) { return light + thr * cloud_scatter_ground(x + d * g.x, k_t); }
                return light + thr * sky_radiance(d);
            }
            let span = cloud_sphere(x, d, r + base);
            x = x + d * (max(span.y, 0.0) + 1e-2);
            continue;
        }
        x = x + d * (-log(1.0 - cloud_scatter_rand(state)) / majorant);
        let a2 = cloud_altitude(x);
        if (a2 >= top || a2 <= base) { continue; }
        let sigma = cloud_density(x, true) * clouds.layer.z * k_t;
        if (cloud_scatter_rand(state) >= sigma / majorant) { continue; }
        thr *= albedo_t;
        let ph = cloud_phase_truncated(dot(d, sun));
        if (ph > 0.0) {
            let sun_light = sky.sunIlluminance.rgb * cloud_sun_atmosphere(x);
            light += thr * sun_light * exp(-cloud_shadow_depth(x) * k_t) * ph;
        }
        d = cloud_scatter_direction(d, state);
        hits++;
        if (hits >= n) { return light; }
    }
    return light + thr * sky_radiance(d);
}

/** Há nuvem (a forma sem o detalhe) na sonda `g` ou numa das seis vizinhas. */
fn cloud_scatter_active(g: vec3u, size: vec3u) -> bool {
    let gi = vec3i(g);
    let hi = vec3i(size) - 1;
    for (var k = 0; k < 7; k++) {
        let axis = (k - 1) / 2;
        let sign = select(-1, 1, (k & 1) == 0);
        let o = select(vec3i(0), vec3i(i32(axis == 0), i32(axis == 1), i32(axis == 2)) * sign, k > 0);
        let q = clamp(gi + o, vec3i(0), hi);
        if (cloud_density(cloud_scatter_probe(vec3u(q), size), false) > 0.0) { return true; }
    }
    return false;
}

/** O centro da grade de uma posição da câmera (o mesmo encaixe do empacotamento). */
fn cloud_scatter_center(eye: vec3f) -> vec2f {
    let s = clouds.scatterParams.w;
    return floor(eye.xz / s + 0.5) * s;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_scatter_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(workgroup_id) wid: vec3u,
) {
    let size = textureDimensions(cloud_scatter_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y * size.z) { return; }
    let g = vec3u(i % size.x, (i / size.x) % size.y, i / (size.x * size.y));
    let work = clouds.scatterWork;
    let cam = cameras[clouds.march.w];
    // A posição da câmera no quadro anterior (a vista anterior é rígida): o centro da grade que ela dava.
    let pv = cam.previousView;
    let prev_eye = -(transpose(mat3x3f(pv[0].xyz, pv[1].xyz, pv[2].xyz)) * pv[3].xyz);
    let moved = any(cloud_scatter_center(prev_eye) != clouds.scatterGrid.xy);
    let valid = clouds.scatterParams.z > 0.5 && cam.history.x < 0.5 && !moved;
    let sun = sky.sunDirection.xyz;
    if (i == 0u) { textureStore(cloud_scatter_sun_out, vec2u(0u, 0u), vec4f(sun, 1.0)); }
    let prev_sun = textureLoad(cloud_scatter_sun_prev, vec2u(0u, 0u), 0);
    var keep = 1.0;
    if (prev_sun.w > 0.5) {
        keep = exp(-acos(clamp(dot(prev_sun.xyz, sun), -1.0, 1.0)) / CLOUD_SCATTER_SUN_MEMORY);
    }
    var q = vec4f(0.0);
    if (valid) { q = textureLoad(cloud_scatter_prev, g, 0) * keep; }
    let group = wid.x + wid.y * nwg.x;
    if ((group + work.z) % max(work.x, 1u) == 0u) {
        if (cloud_scatter_active(g, size)) {
            let x = cloud_scatter_probe(g, size);
            let dcam = normalize(x - clouds.eye.xyz);
            var state = random_seed(RANDOM_STREAM_CLOUD_SCATTER, i, work.z);
            let s = cloud_scatter_walk(x, dcam, work.y, &state) / max(sky.sunIlluminance.g, 1e-6);
            // A média com janela: a soma e a contagem escaladas para a contagem não passar do teto.
            let n = q.a + 1.0;
            let keep = min(n, clouds.scatterParams.y) / n;
            q = vec4f((q.rgb + s) * keep, n * keep);
        } else {
            q = vec4f(0.0);
        }
    }
    textureStore(cloud_scatter_out, g, q);
}
