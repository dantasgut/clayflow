// Nó de tangente pelo uv (spec 011, R4): o referencial cotangente das derivadas de tela da posição e do uv (Schüler
// 2013) — a direção de u na superfície, para o especular anisotrópico de malhas sem tangente no vértice. Só no
// fragmento (derivadas de tela); sem uv variando, uma direção estável derivada da normal.
// Requer: nada.

fn node_geometry_tangent_uv(position: vec3f, normal: vec3f, uv: vec2f) -> vec3f {
    let dp1 = dpdx(position);
    let dp2 = dpdy(position);
    let duv1 = dpdx(uv);
    let duv2 = dpdy(uv);
    let n = normalize(normal);
    let dp2perp = cross(dp2, n);
    let dp1perp = cross(n, dp1);
    let t = dp2perp * duv1.x + dp1perp * duv2.x;
    let len2 = dot(t, t);
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let fallback = vec3f(1.0 + s * n.x * n.x * a, s * n.x * n.y * a, -s * n.x);
    return select(fallback, t * inverseSqrt(max(len2, 1e-30)), len2 > 1e-20);
}
