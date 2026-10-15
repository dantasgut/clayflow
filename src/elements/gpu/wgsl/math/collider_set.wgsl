// Conjunto de colliders (spec 005, R17): pools tipados de plano, caixa, esfera, malha e superfície (spec 010), com a pose dos colliders
// dinâmicos vinda do corpo dono. Ligado no grupo 2 pelos estágios que colidem partículas/nós contra o mundo (SPH, PBF,
// MPM); o `ColliderSet` (C3) fornece as fontes por nome. A malha está no grupo (spec 006, A6), mas nenhuma função
// daqui a usa ainda — `MeshCollider` não gera contato (lacuna P2), então os layouts inferidos não a incluem.
//
// Requer: structs `ColliderSetCounts`, `PlaneCollider`, `BoxCollider`, `SphereCollider`, `MeshCollider`, `RigidBody`
// e `SurfaceCollider` (gerados dos schemas); `quat.wgsl`; `sdf.wgsl`; `surface_collider_hit.wgsl`.

@group(2) @binding(0) var<uniform>       collider_counts:        ColliderSetCounts;
@group(2) @binding(1) var<storage, read> collider_planes:        array<PlaneCollider>;
@group(2) @binding(2) var<storage, read> collider_boxes:         array<BoxCollider>;
@group(2) @binding(3) var<storage, read> collider_spheres:       array<SphereCollider>;
// Donos das caixas e das esferas num só mapa (caixas a partir de 0, esferas a partir de `sphere_owner_base`).
@group(2) @binding(4) var<storage, read> collider_owners:        array<u32>;
@group(2) @binding(7) var<storage, read> collider_bodies:        array<RigidBody>;
@group(2) @binding(8) var<storage, read> collider_meshes:        array<MeshCollider>;
@group(2) @binding(9) var<storage, read> collider_mesh_owners:   array<u32>;
@group(2) @binding(11) var<storage, read> collider_surface_field: array<f32>;

// Collider sem corpo dono: o centro é a posição de mundo, sem rotação.
const COLLIDER_NO_OWNER: u32 = 0xFFFFFFFFu;

struct ColliderPose {
    pos: vec3f,
    rot: vec4f,
}

// Início do campo do colisor de superfície i no pool (até 16, no uniforme de contagens).
fn surface_collider_first(i: u32) -> u32 {
    let firsts = array<vec4u, 4>(
        collider_counts.surface_first0,
        collider_counts.surface_first1,
        collider_counts.surface_first2,
        collider_counts.surface_first3,
    );
    return firsts[i / 4u][i % 4u];
}

fn collider_pose(owner: u32, center_local: vec3f) -> ColliderPose {
    if (owner == COLLIDER_NO_OWNER) {
        return ColliderPose(center_local, vec4f(0.0, 0.0, 0.0, 1.0));
    }
    let body_pos = collider_bodies[owner].pos_pred.xyz;
    let body_rot = collider_bodies[owner].rot_pred;
    return ColliderPose(body_pos + quat_rotate_vec(body_rot, center_local), body_rot);
}

// Plano em espaço de mundo (como na narrowphase): f(p) = dot(p, n) − offset.
fn collider_hit_plane(i: u32, p: vec3f) -> ColliderHit {
    let n = normalize(collider_planes[i].normal.xyz);
    return ColliderHit(sdf_plane(p, n, collider_planes[i].offset), n);
}

fn collider_hit_box(i: u32, p: vec3f) -> ColliderHit {
    let pose  = collider_pose(collider_owners[i], collider_boxes[i].center.xyz);
    let half  = collider_boxes[i].halfExtents.xyz;
    let local = quat_rotate_vec_inv(pose.rot, p - pose.pos);
    let d     = sdf_box(local, half);
    let g     = sdf_gradient_rb(local, d, 1u, vec4f(half, 0.0));
    return ColliderHit(d, normalize(quat_rotate_vec(pose.rot, g)));
}

fn collider_hit_sphere(i: u32, p: vec3f) -> ColliderHit {
    let pose = collider_pose(collider_owners[collider_counts.sphere_owner_base + i], collider_spheres[i].center.xyz);
    let r    = p - pose.pos;
    let len  = length(r);
    let n    = select(vec3f(0.0, 1.0, 0.0), r / len, len > 1e-8);
    return ColliderHit(sdf_sphere(r, collider_spheres[i].radius), n);
}

// Partícula de raio `radius`: se penetra, sai pela normal e a componente normal entrante da velocidade é refletida com
// a restituição dada.
fn collider_resolve_particle(
    hit: ColliderHit,
    p: ptr<function, vec3f>,
    v: ptr<function, vec3f>,
    radius: f32,
    restitution: f32,
) {
    if (hit.dist >= radius) { return; }
    *p += (radius - hit.dist) * hit.normal;
    let vn = dot(*v, hit.normal);
    if (vn < 0.0) { *v -= (1.0 + restitution) * vn * hit.normal; }
}

// Empurra a partícula para fora de todos os colliders (plano, caixa, esfera, superfície, nessa ordem; sem superfícies
// o último laço não roda e as contas são as de antes — spec 010).
fn collider_set_push_out(p: ptr<function, vec3f>, v: ptr<function, vec3f>, radius: f32, restitution: f32) {
    for (var i = 0u; i < collider_counts.plane_count; i++) {
        collider_resolve_particle(collider_hit_plane(i, *p), p, v, radius, restitution);
    }
    for (var i = 0u; i < collider_counts.box_count; i++) {
        collider_resolve_particle(collider_hit_box(i, *p), p, v, radius, restitution);
    }
    for (var i = 0u; i < collider_counts.sphere_count; i++) {
        collider_resolve_particle(collider_hit_sphere(i, *p), p, v, radius, restitution);
    }
    for (var i = 0u; i < collider_counts.surface_count; i++) {
        collider_resolve_particle(collider_hit_surface(i, *p), p, v, radius + surface_collider_margin(i), restitution);
    }
}

// Nó de grade a menos de `band` da superfície (ou dentro): remove a componente normal entrante da velocidade
// (deslizamento livre). A faixa de uma célula mantém as partículas fora do collider sem mover posições (o volume
// das partículas fica coerente com o J).
fn collider_constrain_node(hit: ColliderHit, v: ptr<function, vec3f>, band: f32) {
    if (hit.dist >= band) { return; }
    let vn = dot(*v, hit.normal);
    if (vn < 0.0) { *v -= vn * hit.normal; }
}

fn collider_set_constrain(p: vec3f, v: ptr<function, vec3f>, band: f32) {
    for (var i = 0u; i < collider_counts.plane_count; i++) {
        collider_constrain_node(collider_hit_plane(i, p), v, band);
    }
    for (var i = 0u; i < collider_counts.box_count; i++) {
        collider_constrain_node(collider_hit_box(i, p), v, band);
    }
    for (var i = 0u; i < collider_counts.sphere_count; i++) {
        collider_constrain_node(collider_hit_sphere(i, p), v, band);
    }
    for (var i = 0u; i < collider_counts.surface_count; i++) {
        collider_constrain_node(collider_hit_surface(i, p), v, band);
    }
}

// ── Adesão de fluidos às fronteiras (spec 030) ──────────────────────────────────────────────────────────────────────
// A fronteira é genérica: distância com sinal e normal (`ColliderHit`) — os planos do domínio e os colliders do conjunto
// hoje; os colisores de fluido da 015/016 entram pelo mesmo `ColliderHit`.

// Adesão de uma fronteira a menos de H: a velocidade ganha `dt · accel · I(δ)` na direção da superfície (I = integral de
// meio-espaço do núcleo de Akinci, δ = d/H; dentro do sólido, δ = 0) e a componente tangencial é amortecida
// implicitamente por `1 / (1 + dt · tangential · I(δ))` (aderência ao escorrer, sem instabilidade).
fn collider_adhesion_contact(
    hit: ColliderHit,
    v: ptr<function, vec3f>,
    H: f32,
    accel: f32,
    tangential: f32,
    dt: f32,
) {
    if (hit.dist >= H) { return; }
    let weight = akinci_adhesion_half_space(max(hit.dist, 0.0) / H);
    if (weight <= 0.0) { return; }
    let n = hit.normal;
    var vel = *v - dt * accel * weight * n;
    let vn = dot(vel, n);
    let vt = (vel - vn * n) / (1.0 + dt * tangential * weight);
    *v = vn * n + vt;
}

// Adesão somada sobre os planos do domínio (piso e lados mínimos, como a colisão) e os colliders plano/caixa/esfera/
// superfície.
fn collider_set_adhesion(
    p: vec3f,
    v: ptr<function, vec3f>,
    H: f32,
    accel: f32,
    tangential: f32,
    dt: f32,
    bound_min: vec3f,
) {
    collider_adhesion_contact(ColliderHit(p.y - bound_min.y, vec3f(0.0, 1.0, 0.0)), v, H, accel, tangential, dt);
    collider_adhesion_contact(ColliderHit(p.x - bound_min.x, vec3f(1.0, 0.0, 0.0)), v, H, accel, tangential, dt);
    collider_adhesion_contact(ColliderHit(p.z - bound_min.z, vec3f(0.0, 0.0, 1.0)), v, H, accel, tangential, dt);
    for (var i = 0u; i < collider_counts.plane_count; i++) {
        collider_adhesion_contact(collider_hit_plane(i, p), v, H, accel, tangential, dt);
    }
    for (var i = 0u; i < collider_counts.box_count; i++) {
        collider_adhesion_contact(collider_hit_box(i, p), v, H, accel, tangential, dt);
    }
    for (var i = 0u; i < collider_counts.sphere_count; i++) {
        collider_adhesion_contact(collider_hit_sphere(i, p), v, H, accel, tangential, dt);
    }
    for (var i = 0u; i < collider_counts.surface_count; i++) {
        collider_adhesion_contact(collider_hit_surface(i, p), v, H, accel, tangential, dt);
    }
}
