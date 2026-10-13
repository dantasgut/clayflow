// Conjunto de colliders (spec 005, R17): pools tipados de plano, caixa, esfera e malha, com a pose dos colliders
// dinâmicos vinda do corpo dono. Ligado no grupo 2 pelos estágios que colidem partículas/nós contra o mundo (SPH, PBF,
// MPM); o `ColliderSet` (C3) fornece as fontes por nome. A malha está no grupo (spec 006, A6), mas nenhuma função
// daqui a usa ainda — `MeshCollider` não gera contato (lacuna P2), então os layouts inferidos não a incluem.
//
// Requer: structs `ColliderSetCounts`, `PlaneCollider`, `BoxCollider`, `SphereCollider`, `MeshCollider`, `RigidBody`
// (gerados dos schemas); `quat.wgsl`; `sdf.wgsl`.

@group(2) @binding(0) var<uniform>       collider_counts:        ColliderSetCounts;
@group(2) @binding(1) var<storage, read> collider_planes:        array<PlaneCollider>;
@group(2) @binding(2) var<storage, read> collider_boxes:         array<BoxCollider>;
@group(2) @binding(3) var<storage, read> collider_spheres:       array<SphereCollider>;
@group(2) @binding(4) var<storage, read> collider_plane_owners:  array<u32>;
@group(2) @binding(5) var<storage, read> collider_box_owners:    array<u32>;
@group(2) @binding(6) var<storage, read> collider_sphere_owners: array<u32>;
@group(2) @binding(7) var<storage, read> collider_bodies:        array<RigidBody>;
@group(2) @binding(8) var<storage, read> collider_meshes:        array<MeshCollider>;
@group(2) @binding(9) var<storage, read> collider_mesh_owners:   array<u32>;

// Collider sem corpo dono: o centro é a posição de mundo, sem rotação.
const COLLIDER_NO_OWNER: u32 = 0xFFFFFFFFu;

struct ColliderPose {
    pos: vec3f,
    rot: vec4f,
}

// Distância com sinal até a superfície (negativa dentro) e normal de mundo apontando para fora.
struct ColliderHit {
    dist:   f32,
    normal: vec3f,
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
    let pose  = collider_pose(collider_box_owners[i], collider_boxes[i].center.xyz);
    let half  = collider_boxes[i].halfExtents.xyz;
    let local = quat_rotate_vec_inv(pose.rot, p - pose.pos);
    let d     = sdf_box(local, half);
    let g     = sdf_gradient_rb(local, d, 1u, vec4f(half, 0.0));
    return ColliderHit(d, normalize(quat_rotate_vec(pose.rot, g)));
}

fn collider_hit_sphere(i: u32, p: vec3f) -> ColliderHit {
    let pose = collider_pose(collider_sphere_owners[i], collider_spheres[i].center.xyz);
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

// Empurra a partícula para fora de todos os colliders (plano, caixa, esfera, nessa ordem).
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
}
