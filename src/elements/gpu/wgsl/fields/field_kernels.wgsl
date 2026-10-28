// Núcleos anisotrópicos das partículas (spec 033, R11; Yu & Turk 2013 — a regra de `fields/reference/field.ts`): os
// vizinhos dentro do raio do núcleo pela grade hash; a média ponderada (peso 1 − (d/r)³) suaviza a posição; a covariância
// em volta dela dá, pelos autovalores (Jacobi), os raios do núcleo ao longo dos eixos próprios — o maior vale o raio, os
// outros até 1/k_r dele. Com poucos vizinhos, um núcleo isotrópico menor (gotas separadas não se fundem); encostado num
// sólido (`field_sorted_contacts`, spec 034) e com água que molha (`fluid_field.contact`), achatado contra ele no
// lugar do contato — a calota do ângulo de contato, com o mesmo volume. Grava por
// partícula três `vec4f`: (centro, det G), (G₀₀, G₀₁, G₀₂, G₁₁), (G₁₂, G₂₂, maior raio, 1 no núcleo esparso — a gota
// solta, spec 034 — e 0 no do volume).
// Requer: WORKGROUP_SIZE, fluid_field, spatial_hash, grid, cell_start, cell_count, field_sorted (leitura),
// field_kernel, field_sorted_contacts.

/** Autovalores (decrescentes) e autovetores (colunas) de uma simétrica 3 × 3 (Jacobi cíclico). */
struct FieldEigen {
    values: vec3f,
    vectors: mat3x3f,
}

fn field_eigen(m: mat3x3f) -> FieldEigen {
    var a = m;
    var v = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
    let scale = a[0][0] * a[0][0] + a[1][1] * a[1][1] + a[2][2] * a[2][2];
    for (var sweep = 0u; sweep < 8u; sweep++) {
        // Convergiu (quadrática): os fora da diagonal já não pesam.
        if (a[1][0] * a[1][0] + a[2][0] * a[2][0] + a[2][1] * a[2][1] <= 1e-12 * scale) { break; }
        for (var r = 0u; r < 3u; r++) {
            let p = select(select(1u, 0u, r == 1u), 0u, r == 0u);
            let q = select(select(2u, 2u, r == 1u), 1u, r == 0u);
            let apq = a[q][p];
            if (abs(apq) < 1e-20) { continue; }
            let theta = (a[q][q] - a[p][p]) / (2.0 * apq);
            let t = select(-1.0, 1.0, theta >= 0.0) / (abs(theta) + sqrt(theta * theta + 1.0));
            let c = 1.0 / sqrt(t * t + 1.0);
            let s = t * c;
            // A ← Jᵀ A J; V ← V J (matrizes de coluna: a[col][row]).
            let cp = a[p];
            let cq = a[q];
            a[p] = c * cp - s * cq;
            a[q] = s * cp + c * cq;
            for (var k = 0u; k < 3u; k++) {
                let rp = a[k][p];
                let rq = a[k][q];
                a[k][p] = c * rp - s * rq;
                a[k][q] = s * rp + c * rq;
            }
            let vp = v[p];
            let vq = v[q];
            v[p] = c * vp - s * vq;
            v[q] = s * vp + c * vq;
        }
    }
    var vals = vec3f(a[0][0], a[1][1], a[2][2]);
    var vecs = v;
    // Ordem decrescente.
    for (var i = 0u; i < 2u; i++) {
        for (var j = 0u; j < 2u - i; j++) {
            if (vals[j] < vals[j + 1u]) {
                let tv = vals[j];
                vals[j] = vals[j + 1u];
                vals[j + 1u] = tv;
                let tc = vecs[j];
                vecs[j] = vecs[j + 1u];
                vecs[j + 1u] = tc;
            }
        }
    }
    return FieldEigen(vals, vecs);
}

// Unidade do ponto fixo das somas dos vizinhos (≈ 40 vizinhos × 2²² cabem em i32).
const FIELD_KERNEL_ONE: f32 = 4194304.0;

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_kernels_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= fluid_field.sizes.x) { return; }
    // Na ordem da grade (`field_sorted`: as partículas de uma célula contíguas): os vizinhos de cada célula lidos em
    // sequência, e os de invocações vizinhas coincidem. O núcleo sai no mesmo índice.
    let i = t;
    let item = field_sorted[t];
    if (item.w < 0.0) {
        field_kernel[i * 3u] = vec4f(0.0);
        field_kernel[i * 3u + 1u] = vec4f(0.0);
        field_kernel[i * 3u + 2u] = vec4f(0.0);
        return;
    }
    let p = item.xyz;
    let r = fluid_field.grid.z;
    let home = sh_cell(p, grid.cell_size);
    // Somas em ponto fixo inteiro (em unidades do raio): a ordem dos vizinhos numa célula da grade varia entre execuções
    // (atômicos), e a soma inteira não depende dela — o campo sai idêntico bit a bit.
    var wsum_i = 0;
    var mean_i = vec3i(0);
    var diag_i = vec3i(0);
    var off_i = vec3i(0);
    var n = 0u;
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let cell = home + vec3i(dx, dy, dz);
                let b = sh_hash(cell, grid.table_mask);
                let start = cell_start[b];
                let count = cell_count[b];
                for (var t = 0u; t < count; t++) {
                    let q = field_sorted[start + t];
                    if (q.w < 0.0 || any(sh_cell(q.xyz, grid.cell_size) != cell)) { continue; }
                    let d = q.xyz - p;
                    let dist = length(d);
                    if (dist >= r) { continue; }
                    let w = 1.0 - pow(dist / r, 3.0);
                    let u = d / r;
                    wsum_i += i32(round(w * FIELD_KERNEL_ONE));
                    mean_i += vec3i(round(w * u * FIELD_KERNEL_ONE));
                    diag_i += vec3i(round(w * u * u * FIELD_KERNEL_ONE));
                    off_i += vec3i(round(w * vec3f(u.x * u.y, u.x * u.z, u.y * u.z) * FIELD_KERNEL_ONE));
                    n++;
                }
            }
        }
    }
    let wsum = f32(wsum_i) / FIELD_KERNEL_ONE;
    let mean = vec3f(mean_i) * (r / FIELD_KERNEL_ONE);
    let diag = vec3f(diag_i) * (r * r / FIELD_KERNEL_ONE);
    let off = vec3f(off_i) * (r * r / FIELD_KERNEL_ONE);
    let second = mat3x3f(vec3f(diag.x, off.x, off.y), vec3f(off.x, diag.y, off.z), vec3f(off.y, off.z, diag.z));
    let xw = mean / max(wsum, 1e-12);
    let lambda = fluid_field.tuning.x;
    let center = p + lambda * xw;
    if (n < fluid_field.limits.x) {
        let rs = fluid_field.tuning.z * r;
        let contact = field_sorted_contacts[t];
        if (fluid_field.contact.x > 0.0 && dot(contact.xyz, contact.xyz) > 0.25 && contact.w < rs) {
            // A calota: raio lateral a e normal c (a² c = rs³: o volume do núcleo esparso), centrada no sólido.
            let nrm = normalize(contact.xyz);
            let a = rs * fluid_field.contact.x;
            let cn = rs * fluid_field.contact.y;
            let g = (1.0 / a) * mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0))
                + (1.0 / cn - 1.0 / a) * mat3x3f(nrm * nrm.x, nrm * nrm.y, nrm * nrm.z);
            field_kernel[i * 3u] = vec4f(center - nrm * contact.w, 1.0 / (a * a * cn));
            field_kernel[i * 3u + 1u] = vec4f(g[0][0], g[1][0], g[2][0], g[1][1]);
            field_kernel[i * 3u + 2u] = vec4f(g[2][1], g[2][2], max(a, cn), 1.0);
            return;
        }
        let s = 1.0 / rs;
        field_kernel[i * 3u] = vec4f(center, s * s * s);
        field_kernel[i * 3u + 1u] = vec4f(s, 0.0, 0.0, s);
        field_kernel[i * 3u + 2u] = vec4f(0.0, s, rs, 1.0);
        return;
    }
    // Covariância em volta da média ponderada (em coordenadas relativas a p).
    let c = second * (1.0 / wsum) - mat3x3f(xw * xw.x, xw * xw.y, xw * xw.z);
    let e = field_eigen(c);
    let s1 = max(e.values.x, 1e-12);
    let radii = r * max(e.values / s1, vec3f(1.0 / fluid_field.tuning.y));
    var g = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
    for (var k = 0u; k < 3u; k++) {
        let v = e.vectors[k];
        g += (1.0 / radii[k]) * mat3x3f(v * v.x, v * v.y, v * v.z);
    }
    field_kernel[i * 3u] = vec4f(center, 1.0 / (radii.x * radii.y * radii.z));
    field_kernel[i * 3u + 1u] = vec4f(g[0][0], g[1][0], g[2][0], g[1][1]);
    field_kernel[i * 3u + 2u] = vec4f(g[2][1], g[2][2], r, 0.0);
}
