// Fronteira sólida dos fluidos de partículas (Akinci et al. 2012; a fronteira como meio-espaço, Koschier e Bender 2017;
// spec 034). Soma, sobre as mesmas fronteiras da adesão (os planos mínimos do domínio com paredes e os colliders), o
// volume do núcleo dentro do sólido e o gradiente dele, `term` = (Σ −B'(d) n, Σ B(d)), e o sólido mais próximo ao
// alcance do núcleo (`nearest`: normal para fora dele, distância; normal zero sem). A densidade da partícula ganha
// ρ₀ Σ B (o sólido conta como fluido em repouso) e a pressão dela empurra para fora pelo gradiente. Cada fronteira como
// meio-espaço local; nos cantos côncavos as fronteiras somam.
// O núcleo é o do solver, fixado na criação do pipeline pela constante `FLUID_BOUNDARY_KERNEL` (0: a spline cúbica do
// SPH, `cubic_half_space`; 1: o poly6 do PBF, `poly6_half_space`) — sem ramo em execução.
// Requer: collider_set (e por ele sph_kernels).

override FLUID_BOUNDARY_KERNEL: u32 = 0u;

/** (B, B') do núcleo do solver a distância com sinal `d` de uma fronteira plana. */
fn fluid_half_space(d: f32, h: f32) -> vec2f {
    if (FLUID_BOUNDARY_KERNEL == 1u) { return poly6_half_space(d, h); }
    return cubic_half_space(d, h);
}

/** A soma da fronteira (`term`) e o sólido mais próximo ao alcance (`nearest`). */
struct ColliderBoundary {
    term: vec4f,
    nearest: vec4f,
}

fn fluid_boundary_add(b: ptr<function, ColliderBoundary>, hit: ColliderHit, h: f32, reach: f32) {
    if (hit.dist >= reach) { return; }
    let k = fluid_half_space(hit.dist, h);
    (*b).term += vec4f(-k.y * hit.normal, k.x);
    if (hit.dist < (*b).nearest.w) { (*b).nearest = vec4f(hit.normal, hit.dist); }
}

/** A fronteira no ponto `p` para o núcleo de comprimento `h` e alcance `reach`. */
fn fluid_boundary(p: vec3f, h: f32, reach: f32, bound_min: vec3f) -> ColliderBoundary {
    var b = ColliderBoundary(vec4f(0.0), vec4f(0.0, 0.0, 0.0, 3.0e38));
    fluid_boundary_add(&b, ColliderHit(p.y - bound_min.y, vec3f(0.0, 1.0, 0.0)), h, reach);
    fluid_boundary_add(&b, ColliderHit(p.x - bound_min.x, vec3f(1.0, 0.0, 0.0)), h, reach);
    fluid_boundary_add(&b, ColliderHit(p.z - bound_min.z, vec3f(0.0, 0.0, 1.0)), h, reach);
    for (var i = 0u; i < collider_counts.plane_count; i++) {
        fluid_boundary_add(&b, collider_hit_plane(i, p), h, reach);
    }
    for (var i = 0u; i < collider_counts.box_count; i++) {
        fluid_boundary_add(&b, collider_hit_box(i, p), h, reach);
    }
    for (var i = 0u; i < collider_counts.sphere_count; i++) {
        fluid_boundary_add(&b, collider_hit_sphere(i, p), h, reach);
    }
    for (var i = 0u; i < collider_counts.surface_count; i++) {
        fluid_boundary_add(&b, collider_hit_surface(surface_collider_first(i), p), h, reach);
    }
    return b;
}
