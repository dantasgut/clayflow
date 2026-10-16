// Nó `set.distributeOnMesh` (spec 031): o candidato i = t · K + k é o k-ésimo ponto do triângulo t, em coordenadas
// baricêntricas uniformes na área tiradas do hash (semente, t, 3k) e (semente, t, 3k + 1): s = √r₁,
// w = (1 − s, s(1 − r₂), s·r₂). Posição, normal (interpolada e normalizada; +y se nula) e uv interpolados. Só depende de
// (semente, t, k) — nunca da ordem das invocações.
// Requer: set_common, noise, distribute, mesh_vertices_in, mesh_triangles_in.

struct DistributeSample {
    position: vec3f,
    normal: vec3f,
    uv: vec2f,
}

fn distribute_sample(i: u32) -> DistributeSample {
    let t = i / distribute.per_triangle;
    let k = i % distribute.per_triangle;
    let tri = mesh_triangles_in[t];
    let a = mesh_vertices_in[tri.a];
    let b = mesh_vertices_in[tri.b];
    let c = mesh_vertices_in[tri.c];
    let r1 = set_hash_unit(hash3(vec3u(distribute.seed, t, 3u * k)));
    let r2 = set_hash_unit(hash3(vec3u(distribute.seed, t, 3u * k + 1u)));
    let s = sqrt(r1);
    let w = vec3f(1.0 - s, s * (1.0 - r2), s * r2);
    let p = w.x * vec3f(a.px, a.py, a.pz) + w.y * vec3f(b.px, b.py, b.pz) + w.z * vec3f(c.px, c.py, c.pz);
    let m = w.x * vec3f(a.nx, a.ny, a.nz) + w.y * vec3f(b.nx, b.ny, b.nz) + w.z * vec3f(c.nx, c.ny, c.nz);
    let len = length(m);
    var n = vec3f(0.0, 1.0, 0.0);
    if (len > 0.0) { n = m / len; }
    let uv = w.x * vec2f(a.u, a.v) + w.y * vec2f(b.u, b.v) + w.z * vec2f(c.u, c.v);
    return DistributeSample(p, n, uv);
}
