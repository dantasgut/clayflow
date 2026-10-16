// Geometria diferencial de uma superfície em um ponto (spec 010), do jato: primeira forma (E, F, G), segunda forma
// (L, M, N, em relação à normal Su × Sv), curvatura gaussiana K = (LN − M²)/(EG − F²), média H e principais k₁ ≥ k₂
// com o sinal convexo positivo (esfera com a normal para fora: H = k₁ = k₂ = 1/r), e a direção principal de k₁ (Su·a +
// Sv·b, autovetor do operador de forma; w = 0 em ponto umbílico). Jato degenerado ou não finito: tudo zero, `valid` 0.
// Requer: struct `SurfaceDiff` (gerado do schema); surface_jet_common.

fn surface_forms(j: SurfaceJet) -> SurfaceDiff {
    var out: SurfaceDiff;
    let E = dot(j.du, j.du);
    let F = dot(j.du, j.dv);
    let G = dot(j.dv, j.dv);
    let det = E * G - F * F;
    let raw = cross(j.du, j.dv);
    let len = length(raw);
    if (!(det > 1e-20 * max(E * G, 1e-30)) || !(len > 1e-20)) { return out; }
    let n = raw / len;
    let L = dot(j.duu, n);
    let M = dot(j.duv, n);
    let N = dot(j.dvv, n);
    let K = (L * N - M * M) / det;
    // Sinal convexo: curvaturas positivas onde a superfície se afasta do lado da normal.
    let H = -(E * N - 2.0 * F * M + G * L) / (2.0 * det);
    let disc = sqrt(max(H * H - K, 0.0));
    let k1 = H + disc;
    let k2 = H - disc;
    // Autovetor de (II' − k₁ I), II' = −II.
    let a1 = vec2f(-M - k1 * F, (L + k1 * E));
    let a2 = vec2f(-N - k1 * G, (M + k1 * F));
    let a = select(a2, a1, dot(a1, a1) >= dot(a2, a2));
    let dir = j.du * a.x + j.dv * a.y;
    let dl = length(dir);
    let umbilic = disc <= 1e-4 * max(abs(H), 1e-6) || dl <= 1e-20;
    out.metric = vec4f(E, F, G, det);
    out.second = vec4f(L, M, N, 0.0);
    out.curvature = vec4f(K, H, k1, k2);
    out.principal = select(vec4f(dir / dl, 1.0), vec4f(0.0), umbilic);
    if (!finite4(out.metric) || !finite4(out.second)
        || !finite4(out.curvature) || !finite4(out.principal)) {
        return SurfaceDiff();
    }
    return out;
}
