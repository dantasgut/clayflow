// Partículas secundárias (spec 010), depois do passo: colisão com os colliders da cena (o spray que toca um sólido se
// desfaz nele; espuma e bolha saem de dentro) e o vértice de cada uma na nuvem de pontos do desenho — posição, tipo e
// fração de vida no uv; a morta vai para longe (cortada).
// Requer: structs DiffuseParams, DiffuseParticle; collider_set (grupo 2).

@group(0) @binding(0) var<uniform>             diffuse_params:   DiffuseParams;
@group(0) @binding(5) var<storage, read_write> diffuse:          array<DiffuseParticle>;
@group(0) @binding(6) var<storage, read_write> diffuse_vertices: array<f32>;

const DIFFUSE_FAR: f32 = 1.0e9;

@compute @workgroup_size(64)
fn diffuse_collide_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    collider_time = diffuse_params.time;
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= diffuse_params.capacity) { return; }
    var d = diffuse[i];
    var alive = d.vel.w > 0.0;
    if (alive) {
        var x = d.pos.xyz;
        var v = d.vel.xyz;
        let before = x;
        collider_set_push_out(&x, &v, 0.0, 0.0);
        if (any(x != before) && d.pos.w == 0.0) {
            // Spray que bateu num sólido: absorvido.
            d.vel.w = 0.0;
            alive = false;
        } else {
            d.pos = vec4f(x, d.pos.w);
            d.vel = vec4f(v, d.vel.w);
        }
        diffuse[i] = d;
    }
    let o = i * 8u;
    let pos = select(vec3f(0.0, DIFFUSE_FAR, 0.0), d.pos.xyz, alive);
    diffuse_vertices[o] = pos.x;
    diffuse_vertices[o + 1u] = pos.y;
    diffuse_vertices[o + 2u] = pos.z;
    diffuse_vertices[o + 3u] = 0.0;
    diffuse_vertices[o + 4u] = 1.0;
    diffuse_vertices[o + 5u] = 0.0;
    diffuse_vertices[o + 6u] = d.pos.w;
    diffuse_vertices[o + 7u] = clamp(d.vel.w / max(diffuse_params.lifetime, 1e-6), 0.0, 1.0);
}
