// Densidade do campo nos voxels (spec 033, R11) por espalhamento: cada partícula soma o núcleo anisotrópico dela nos
// voxels do seu suporte (a caixa justa do elipsoide, só os pontos dentro dele) — a densidade normalizada (a integral do
// núcleo (1 − q²)³ na bola unitária, 16π/315 · 4: massa conservada qualquer que seja a forma; 1 dentro do fluido em
// repouso) em ponto fixo, por `atomicAdd` inteiro: a soma não depende da ordem (imagem determinística). O suporte cabe em
// até 2 × 2 × 2 blocos (alcance ≤ 4 voxels), buscados uma vez por partícula. O buffer é zerado antes do passe.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_lookup, field_sorted (leitura), field_kernel (leitura),
// field_density_write.

const FIELD_KERNEL_NORM: f32 = 0.6383000;

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_density_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    // As partículas estão na ordem da grade; espalhadas entre os grupos (cada grupo pega uma a cada `groups`) para que
    // as invocações vizinhas não somem nos mesmos voxels ao mesmo tempo (atômicos disputados).
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let groups = (fluid_field.sizes.x + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    let i = (t % WORKGROUP_SIZE) * groups + t / WORKGROUP_SIZE;
    if (i >= fluid_field.sizes.x) { return; }
    if (field_sorted[i].w < 0.0) { return; }
    let k0 = field_kernel[i * 3u];
    let k1 = field_kernel[i * 3u + 1u];
    let k2 = field_kernel[i * 3u + 2u];
    let c = k0.xyz;
    let reach = k2.z;
    let voxel = field_voxel();
    // Caixa justa do elipsoide |G d| < 1: d = G⁻¹ u com |u| < 1, então a extensão em cada eixo é a norma da linha de
    // G⁻¹ (simétrica; a inversa pelos cofatores, det G = k0.w). Os núcleos achatados da superfície cobrem bem menos
    // voxels que a caixa do alcance.
    let g = mat3x3f(vec3f(k1.x, k1.y, k1.z), vec3f(k1.y, k1.w, k2.x), vec3f(k1.z, k2.x, k2.y));
    let inv = mat3_adjugate(g) * (1.0 / max(k0.w, 1e-20));
    let extent = min(vec3f(length(inv[0]), length(inv[1]), length(inv[2])), vec3f(reach));
    // Voxels cujo centro ((v + ½) · voxel) cai na caixa.
    let lo = vec3i(ceil((c - extent) / voxel - 0.5));
    let hi = vec3i(floor((c + extent) / voxel - 0.5));
    let blo = vec3i(floor(vec3f(lo) / f32(FIELD_BRICK)));
    var bricks: array<u32, 8>;
    for (var k = 0u; k < 8u; k++) {
        bricks[k] = field_find(blo + vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u)));
    }
    let w0 = pow(fluid_field.grid.x, 3.0) * k0.w / FIELD_KERNEL_NORM * FIELD_DENSITY_ONE;
    let reach2 = reach * reach;
    for (var z = lo.z; z <= hi.z; z++) {
        for (var y = lo.y; y <= hi.y; y++) {
            for (var x = lo.x; x <= hi.x; x++) {
                let v = vec3i(x, y, z);
                let d = (vec3f(v) + 0.5) * voxel - c;
                if (dot(d, d) >= reach2) { continue; }
                let q = vec3f(
                    k1.x * d.x + k1.y * d.y + k1.z * d.z,
                    k1.y * d.x + k1.w * d.y + k2.x * d.z,
                    k1.z * d.x + k2.x * d.y + k2.y * d.z,
                );
                let q2 = dot(q, q);
                if (q2 >= 1.0) { continue; }
                let b = vec3i(floor(vec3f(v) / f32(FIELD_BRICK)));
                let o = clamp(b - blo, vec3i(0), vec3i(1));
                let brick = bricks[u32(o.x + 2 * o.y + 4 * o.z)];
                if (brick == NONE) { continue; }
                let s = 1.0 - q2;
                atomicAdd(&field_density[field_interior_at(brick, v - b * FIELD_BRICK)], u32(w0 * s * s * s + 0.5));
            }
        }
    }
}
