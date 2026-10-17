// Distância com sinal do campo (spec 033, R11 — a regra de `fields/reference/field.ts`): `field_smooth_{x,y,z}_main`
// filtram a densidade (binomial 3 × 3 × 3 separável: zera a ondulação na escala do espaçamento das partículas, 2 voxels, sem deslocar a
// superfície plana), `field_init_main` faz o φ inicial pela densidade filtrada (a distância de primeira ordem ao nível
// do quadro, positiva fora, limitada à faixa de cálculo), `field_classify_main` acha a interface (algum vizinho das faces
// do outro lado) e põe nela a distância pelos cruzamentos interpolados (Chopp) — os outros voxels começam no teto — e
// `field_eikonal_main` faz uma iteração de Jacobi do método rápido da eikonal (Zhao): cada voxel fica com o menor entre
// o seu valor e a solução pelos vizinhos, a distância anda um voxel por iteração; o não alcançado fica no teto (as
// iterações + 1 voxels, um limite inferior: os passos da marcha seguros). Os vizinhos de fora do bloco vêm pelos blocos
// vizinhos (`field_links`); sem bloco, no teto.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_lookup (o nível do quadro), field_counts (leitura),
// field_links (leitura), field_density (leitura), field_phi0, field_flags, field_src (leitura), field_dst.

fn field_redistance_bricks() -> u32 {
    return min(field_counts[0].count, fluid_field.sizes.y);
}

/** Faixa de cálculo do φ inicial (m): 3 × a útil. */
fn field_compute_band() -> f32 {
    return 3.0 * fluid_field.grid.w;
}

/** Teto da distância (m): as iterações + 1 voxels (o não alcançado pela eikonal; sem bloco). */
fn field_cap() -> f32 {
    return f32(fluid_field.sizes.w + 1u) * field_voxel();
}

/** Bloco e voxel locais de um voxel `v` (que pode sair do bloco por um) via os vizinhos das faces. */
fn field_neighbor_index(brick: u32, v: vec3i) -> u32 {
    let d = vec3i(floor(vec3f(v) / 8.0));
    if (all(d == vec3i(0))) { return field_interior_at(brick, v); }
    let k = u32((d.x + 1) + 3 * ((d.y + 1) + 3 * (d.z + 1)));
    let nb = field_links[brick * 28u + k];
    if (nb == NONE) { return NONE; }
    return field_interior_at(nb, v - d * FIELD_BRICK);
}

fn field_read_density(brick: u32, v: vec3i) -> f32 {
    let i = field_neighbor_index(brick, v);
    return select(f32(field_density[i]) / FIELD_DENSITY_ONE, 0.0, i == NONE);
}

/** Densidade filtrada (em `field_src`) num voxel vizinho; sem bloco, zero. */
fn field_read_rho(brick: u32, v: vec3i) -> f32 {
    let i = field_neighbor_index(brick, v);
    return select(field_src[i], 0.0, i == NONE);
}

fn field_read_src(brick: u32, v: vec3i) -> f32 {
    let i = field_neighbor_index(brick, v);
    return select(field_src[i], field_cap(), i == NONE);
}

/** φ inicial de um voxel vizinho; sem bloco, o teto (do lado de fora). */
fn field_read_phi0(brick: u32, v: vec3i) -> f32 {
    let i = field_neighbor_index(brick, v);
    return select(field_phi0[i], field_cap(), i == NONE);
}

// O filtro binomial 3 × 3 × 3 separável: (1, 2, 1)/4 em x (a densidade em ponto fixo), depois em y e em z (o passo
// anterior em `field_src`).
@compute @workgroup_size(WORKGROUP_SIZE)
fn field_smooth_x_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= field_redistance_bricks()) { return; }
    for (var row = lid; row < 64u; row += WORKGROUP_SIZE) {
        let v0 = vec3i(0, i32(row % 8u), i32(row / 8u));
        for (var x = 0; x < FIELD_BRICK; x++) {
            let v = v0 + vec3i(x, 0, 0);
            let sum = field_read_density(brick, v - vec3i(1, 0, 0)) + 2.0 * field_read_density(brick, v)
                + field_read_density(brick, v + vec3i(1, 0, 0));
            field_dst[field_interior_at(brick, v)] = 0.25 * sum;
        }
    }
}

/** y e z: o passo anterior (`field_src`) num eixo. */
fn field_smooth_src(brick: u32, row: u32, axis: vec3i) {
    let v0 = vec3i(0, i32(row % 8u), i32(row / 8u));
    for (var x = 0; x < FIELD_BRICK; x++) {
        let v = v0 + vec3i(x, 0, 0);
        let sum = field_read_rho(brick, v - axis) + 2.0 * field_read_rho(brick, v) + field_read_rho(brick, v + axis);
        field_dst[field_interior_at(brick, v)] = 0.25 * sum;
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_smooth_y_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= field_redistance_bricks()) { return; }
    for (var row = lid; row < 64u; row += WORKGROUP_SIZE) { field_smooth_src(brick, row, vec3i(0, 1, 0)); }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_smooth_z_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= field_redistance_bricks()) { return; }
    for (var row = lid; row < 64u; row += WORKGROUP_SIZE) { field_smooth_src(brick, row, vec3i(0, 0, 1)); }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_init_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= field_redistance_bricks()) { return; }
    let voxel = field_voxel();
    let band = field_compute_band();
    for (var row = lid; row < 64u; row += WORKGROUP_SIZE) {
        let y = i32(row % 8u);
        let z = i32(row / 8u);
        for (var x = 0; x < FIELD_BRICK; x++) {
            let v = vec3i(x, y, z);
            let g = vec3f(
                field_read_rho(brick, v + vec3i(1, 0, 0)) - field_read_rho(brick, v - vec3i(1, 0, 0)),
                field_read_rho(brick, v + vec3i(0, 1, 0)) - field_read_rho(brick, v - vec3i(0, 1, 0)),
                field_read_rho(brick, v + vec3i(0, 0, 1)) - field_read_rho(brick, v - vec3i(0, 0, 1)),
            ) / (2.0 * voxel);
            let iso = field_iso();
            let gl = max(length(g), iso / band);
            let rho = field_src[field_interior_at(brick, v)];
            let phi = clamp((iso - rho) / gl, -band, band);
            field_phi0[field_interior_at(brick, v)] = phi;
        }
    }
}

/** Solução da eikonal discreta (unidades de voxel) pelos vizinhos dos três eixos (Zhao 2005). */
fn field_eikonal_solve(m: vec3f) -> f32 {
    // Ordena a ≤ b ≤ c.
    let a = min(min(m.x, m.y), m.z);
    let c = max(max(m.x, m.y), m.z);
    let b = m.x + m.y + m.z - a - c;
    var d = a + 1.0;
    if (d > b) {
        d = 0.5 * (a + b + sqrt(max(0.0, 2.0 - (a - b) * (a - b))));
        if (d > c) {
            let s = a + b + c;
            d = (s + sqrt(max(0.0, s * s - 3.0 * (a * a + b * b + c * c - 1.0)))) / 3.0;
        }
    }
    return d;
}

/** Fração do voxel até o cruzamento com o vizinho `q` do outro lado de `p` (∞ do mesmo lado). */
fn field_crossing(p: f32, q: f32) -> f32 {
    if ((q <= 0.0) == (p <= 0.0)) { return 1e30; }
    return p / (p - q);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_classify_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= field_redistance_bricks()) { return; }
    let voxel = field_voxel();
    let cap = field_cap();
    for (var row = lid; row < 64u; row += WORKGROUP_SIZE) {
        let y = i32(row % 8u);
        let z = i32(row / 8u);
        for (var x = 0; x < FIELD_BRICK; x++) {
            let v = vec3i(x, y, z);
            let i = field_interior_at(brick, v);
            let p = field_phi0[i];
            let inside = p <= 0.0;
            let theta = vec3f(
                min(field_crossing(p, field_read_phi0(brick, v + vec3i(1, 0, 0))), field_crossing(p, field_read_phi0(brick, v - vec3i(1, 0, 0)))),
                min(field_crossing(p, field_read_phi0(brick, v + vec3i(0, 1, 0))), field_crossing(p, field_read_phi0(brick, v - vec3i(0, 1, 0)))),
                min(field_crossing(p, field_read_phi0(brick, v + vec3i(0, 0, 1))), field_crossing(p, field_read_phi0(brick, v - vec3i(0, 0, 1)))),
            );
            let t = max(theta, vec3f(1e-6));
            let inv = select(vec3f(0.0), 1.0 / (t * t), theta < vec3f(1e29));
            let sum = inv.x + inv.y + inv.z;
            let sign = select(1.0, -1.0, inside);
            if (sum > 0.0) {
                // Interface: a distância pelos cruzamentos (Chopp), fixa nas iterações.
                let d = sign * voxel / sqrt(sum);
                field_flags[i] = d;
                field_dst[i] = d;
            } else {
                // Longe: o sinal (marcado fora do alcance da distância) e o teto.
                field_flags[i] = sign * 1e30;
                field_dst[i] = sign * cap;
            }
        }
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_eikonal_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= field_redistance_bricks()) { return; }
    let voxel = field_voxel();
    for (var row = lid; row < 64u; row += WORKGROUP_SIZE) {
        let y = i32(row % 8u);
        let z = i32(row / 8u);
        for (var x = 0; x < FIELD_BRICK; x++) {
            let v = vec3i(x, y, z);
            let i = field_interior_at(brick, v);
            let flag = field_flags[i];
            if (abs(flag) < 1e29) {
                field_dst[i] = flag;
                continue;
            }
            let m = vec3f(
                min(abs(field_read_src(brick, v + vec3i(1, 0, 0))), abs(field_read_src(brick, v - vec3i(1, 0, 0)))),
                min(abs(field_read_src(brick, v + vec3i(0, 1, 0))), abs(field_read_src(brick, v - vec3i(0, 1, 0)))),
                min(abs(field_read_src(brick, v + vec3i(0, 0, 1))), abs(field_read_src(brick, v - vec3i(0, 0, 1)))),
            ) / voxel;
            let c = field_src[i];
            field_dst[i] = sign(flag) * min(abs(c), field_eikonal_solve(m) * voxel);
        }
    }
}
