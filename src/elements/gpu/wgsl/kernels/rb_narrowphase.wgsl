// Narrowphase em 4 variantes, uma por pool de Collider da Camada 3.
// Cada variante reusa a mesma lógica matemática (SDF, gradiente, supressão,
// predictive contact, warm-starting) mudando apenas o struct do pool de
// collider lido e a função de SDF específica da shape.
//
// Lê de: bodies (pool RigidBody:LCP), body_owners (mapa CPU: collider_slot →
// rb_idx do owner, 0xFFFFFFFFu se estático), e pool tipado de colliders.
// Escreve em: contacts[slot] onde slot = contact_base_offset + rb_i * pool_count + col_j.
//
// Dispatch: workgroup_size=64, threads = body_count * pool_count.
// LCPFlow dispatcha por pool quando count > 0.

@group(0) @binding(0) var<uniform>             rb_params:   RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:      array<RigidBody>;
@group(0) @binding(2) var<uniform>             np_params:   NarrowphaseParams;
@group(0) @binding(3) var<storage, read>       body_owners: array<u32>;
@group(0) @binding(4) var<storage, read_write> contacts:    array<RBContact>;

// Binding 5: pool específico da variante — declarado por kernel via concat WGSL no TS.

struct NarrowphaseParams {
    pool_count:       u32,  // número de colliders neste pool
    pool_base:        u32,  // offset deste pool dentro da linha de contatos do body
    total_col_count:  u32,  // soma de todos os pools (= rb_params.collider_count)
    _pad0:            u32,
}

const SHAPE_TYPE_BODY_SPHERE: u32 = 0u;
const SHAPE_TYPE_BODY_BOX:    u32 = 1u;

// Restituição combinada do par (padrão Bullet/Box2D).
fn combine_restitution(a: f32, b: f32) -> f32 {
    return max(a, b);
}

// Gera os 8 cantos de um OBB em espaço-mundo.
fn box_corners_world(cm: vec3f, q: vec4f, he: vec3f, corners: ptr<function, array<vec3f, 8>>) {
    let sx = he.x; let sy = he.y; let sz = he.z;
    (*corners)[0] = cm + quat_rotate_vec(q, vec3f(-sx, -sy, -sz));
    (*corners)[1] = cm + quat_rotate_vec(q, vec3f( sx, -sy, -sz));
    (*corners)[2] = cm + quat_rotate_vec(q, vec3f(-sx,  sy, -sz));
    (*corners)[3] = cm + quat_rotate_vec(q, vec3f( sx,  sy, -sz));
    (*corners)[4] = cm + quat_rotate_vec(q, vec3f(-sx, -sy,  sz));
    (*corners)[5] = cm + quat_rotate_vec(q, vec3f( sx, -sy,  sz));
    (*corners)[6] = cm + quat_rotate_vec(q, vec3f(-sx,  sy,  sz));
    (*corners)[7] = cm + quat_rotate_vec(q, vec3f( sx,  sy,  sz));
}

// Estrutura comum descrevendo o teste body × collider em curso.
struct TestContext {
    rb_i:                 u32,
    slot:                 u32,
    owner_rb:             u32,   // 0xFFFFFFFFu se estático
    is_dynamic_col:       bool,
    body_shape_type:      u32,   // 0=sphere, 1=box
}

// Inicializa o slot como inativo e zera warm-start lambdas.
fn deactivate(slot: u32) {
    contacts[slot].is_active = 0u;
    contacts[slot].point.w   = 0.0;
    contacts[slot].lambda_tx = 0.0;
    contacts[slot].lambda_ty = 0.0;
}

// Pré-validação compartilhada: cinemático, self-collision, supressão dynamic-dynamic.
// Retorna true se o slot deve continuar processando; false se foi desativado.
fn precheck_pair(ctx: TestContext, collider_shape_rank: u32) -> bool {
    let inv_mass = bodies[ctx.rb_i].pos.w;
    if (inv_mass == 0.0) {
        contacts[ctx.slot].is_active = 0u;
        return false;
    }
    if (ctx.is_dynamic_col && ctx.owner_rb == ctx.rb_i) {
        contacts[ctx.slot].is_active = 0u;
        return false;
    }
    // Supressão canônica dynamic-dynamic: par secundário é desativado para evitar
    // aplicar impulso 2× (A→B e B→A). Critério: (body_shape, owner_idx).
    if (ctx.is_dynamic_col) {
        let inv_mass_b = bodies[ctx.owner_rb].pos.w;
        if (inv_mass_b > 0.0) {
            let col_body_shape = u32(bodies[ctx.owner_rb].body_shape.x);
            if (ctx.body_shape_type > col_body_shape
             || (ctx.body_shape_type == col_body_shape && ctx.rb_i > ctx.owner_rb)) {
                contacts[ctx.slot].is_active = 0u;
                return false;
            }
        }
    }
    return true;
}

// Decisão final do contato: predictive, depth, warm-start, escrita atômica de RBContact.
// `wn`  — normal mundo unitária (aponta para fora do collider).
// `d`   — SDF real (negativo = penetração).
// `test_world` — ponto de teste em mundo.
// `r_body` — vetor do CM do corpo até o ponto de teste, para v_test (sphere usa zero).
// `sphere_radius_offset` — raio da esfera quando body_shape=sphere (0 em outros casos).
fn write_contact_or_deactivate(ctx: TestContext, wn: vec3f, d: f32,
                                test_world: vec3f, r_body: vec3f,
                                sphere_radius_offset: f32) {
    var v_test: vec3f;
    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        v_test = bodies[ctx.rb_i].vel.xyz + cross(bodies[ctx.rb_i].omega.xyz, r_body);
    } else {
        v_test = bodies[ctx.rb_i].vel.xyz;
    }
    let v_along_n     = dot(v_test, wn);
    let d_speculative = d + v_along_n * rb_params.gravity.w;  // gravity.w = dtSub
    let predictive_on = rb_params.predictive_threshold > 0.0;
    if (d >= 0.0 && (d_speculative >= 0.0 || !predictive_on)) {
        deactivate(ctx.slot);
        return;
    }
    let depth_eff = select(d, d_speculative, d >= 0.0);
    let contact_point = test_world - (depth_eff + sphere_radius_offset) * wn;

    let prev_lambda_n  = contacts[ctx.slot].point.w;
    let prev_lambda_tx = contacts[ctx.slot].lambda_tx;
    let prev_lambda_ty = contacts[ctx.slot].lambda_ty;
    let was_active     = contacts[ctx.slot].is_active;
    let lambda_n  = select(0.0, prev_lambda_n,  was_active == 1u);
    let lambda_tx = select(0.0, prev_lambda_tx, was_active == 1u);
    let lambda_ty = select(0.0, prev_lambda_ty, was_active == 1u);

    contacts[ctx.slot].normal      = vec4f(wn, -depth_eff);
    contacts[ctx.slot].point       = vec4f(contact_point, lambda_n);
    contacts[ctx.slot].rb_idx      = ctx.rb_i;
    contacts[ctx.slot].col_idx     = ctx.slot;
    contacts[ctx.slot].is_active   = 1u;
    contacts[ctx.slot].rb_idx_b    = ctx.owner_rb;
    contacts[ctx.slot].lambda_tx   = lambda_tx;
    contacts[ctx.slot].lambda_ty   = lambda_ty;
    let rest_a = bodies[ctx.rb_i].mat_props.x;
    let rest_b = select(0.0, bodies[ctx.owner_rb].mat_props.x, ctx.is_dynamic_col);
    contacts[ctx.slot].restitution  = combine_restitution(rest_a, rest_b);
    contacts[ctx.slot].diagonal_t2  = 0.0;
    contacts[ctx.slot]._pad3        = d;
    contacts[ctx.slot]._pad4        = 0.0;
}

// Computa transformação para o frame local do collider (apenas relevante para
// colliders dinâmicos). Para estáticos, world space já é o frame do collider
// (com a translação aplicada via `col_center`).
struct ColliderFrame {
    pos: vec3f,    // origem do collider em mundo
    rot: vec4f,    // rotação do collider em mundo (identidade se estático)
}

fn collider_frame_dynamic(owner_rb: u32, col_center_local: vec3f) -> ColliderFrame {
    let body_pos = bodies[owner_rb].pos_pred.xyz;
    let body_rot = bodies[owner_rb].rot_pred;
    let center_world = body_pos + quat_rotate_vec(body_rot, col_center_local);
    return ColliderFrame(center_world, body_rot);
}

fn collider_frame_static(col_center_world: vec3f) -> ColliderFrame {
    return ColliderFrame(col_center_world, vec4f(0.0, 0.0, 0.0, 1.0));
}

// Transforma ponto-mundo para o frame local do collider.
fn world_to_collider_local(world_p: vec3f, frame: ColliderFrame) -> vec3f {
    return quat_rotate_vec_inv(frame.rot, world_p - frame.pos);
}

// Transforma vetor local do collider para mundo.
fn collider_local_to_world(local_v: vec3f, frame: ColliderFrame) -> vec3f {
    return quat_rotate_vec(frame.rot, local_v);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper genérico — body (sphere ou box) vs collider arbitrário descrito por
// SDF + gradiente. Cada variante específica fornece o frame e funções SDF.
// ═══════════════════════════════════════════════════════════════════════════

// Para PlaneCollider (world-space direto, sem frame):
// Plane: f(world) = dot(world_p, normal) - offset
// O gradiente é a própria normal — não precisa de diferenças finitas.
fn narrowphase_body_vs_plane(ctx: TestContext, normal: vec3f, offset: f32) {
    // body shape específico: testa CM (sphere) ou cantos (box).
    let world_cm  = bodies[ctx.rb_i].pos_pred.xyz;
    let rot_pred  = bodies[ctx.rb_i].rot_pred;
    var test_world:           vec3f;
    var r_body:               vec3f = vec3f(0.0);
    var d:                    f32;
    var sphere_radius_offset: f32 = 0.0;

    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        let he = bodies[ctx.rb_i].body_shape.yzw;
        var corners: array<vec3f, 8>;
        box_corners_world(world_cm, rot_pred, he, &corners);
        var best_d:     f32 = 1e30;
        var best_world: vec3f = corners[0];
        var sum_world:  vec3f = vec3f(0.0);
        var pen_count:  f32 = 0.0;
        for (var k: u32 = 0u; k < 8u; k++) {
            let cd = sdf_plane(corners[k], normal, offset);
            if (cd < best_d) {
                best_d     = cd;
                best_world = corners[k];
            }
            if (cd < 0.0) {
                sum_world += corners[k];
                pen_count += 1.0;
            }
        }
        // Centróide quando ≥2 cantos penetram — torque espúrio é eliminado em
        // pousamento plano. Profundidade ainda usa o pior canto.
        if (pen_count >= 2.0) {
            test_world = sum_world / pen_count;
        } else {
            test_world = best_world;
        }
        d      = best_d;
        r_body = test_world - world_cm;
    } else {
        let radius = bodies[ctx.rb_i].body_shape.y;
        let raw    = sdf_plane(world_cm, normal, offset);
        test_world = world_cm;
        d          = raw - radius;
        sphere_radius_offset = radius;
    }
    write_contact_or_deactivate(ctx, normal, d, test_world, r_body, sphere_radius_offset);
}

// Para BoxCollider — usa frame (estático: identity rot; dinâmico: owner rot).
fn narrowphase_body_vs_box(ctx: TestContext, frame: ColliderFrame, half: vec3f) {
    let world_cm = bodies[ctx.rb_i].pos_pred.xyz;
    let rot_pred = bodies[ctx.rb_i].rot_pred;
    var test_world:           vec3f;
    var test_local:           vec3f;
    var r_body:               vec3f = vec3f(0.0);
    var sdf_raw:              f32;
    var d:                    f32;
    var sphere_radius_offset: f32 = 0.0;

    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        let he = bodies[ctx.rb_i].body_shape.yzw;
        var corners: array<vec3f, 8>;
        box_corners_world(world_cm, rot_pred, he, &corners);
        var best_d:     f32 = 1e30;
        var best_world: vec3f = corners[0];
        var best_local: vec3f = world_to_collider_local(corners[0], frame);
        for (var k: u32 = 0u; k < 8u; k++) {
            let cw = corners[k];
            let cl = world_to_collider_local(cw, frame);
            let cd = sdf_box(cl, half);
            if (cd < best_d) {
                best_d     = cd;
                best_world = cw;
                best_local = cl;
            }
        }
        test_world = best_world;
        test_local = best_local;
        sdf_raw    = best_d;
        d          = best_d;
        r_body     = test_world - world_cm;
    } else {
        let radius = bodies[ctx.rb_i].body_shape.y;
        test_world  = world_cm;
        test_local  = world_to_collider_local(world_cm, frame);
        sdf_raw     = sdf_box(test_local, half);
        d           = sdf_raw - radius;
        sphere_radius_offset = radius;
    }

    // Normal analítica (face mais próxima) em frame local; transforma p/ mundo.
    let pen = half - abs(test_local);
    var grad_local: vec3f;
    if (pen.x <= pen.y && pen.x <= pen.z)      { grad_local = vec3f(sign(test_local.x), 0.0, 0.0); }
    else if (pen.y <= pen.z)                   { grad_local = vec3f(0.0, sign(test_local.y), 0.0); }
    else                                       { grad_local = vec3f(0.0, 0.0, sign(test_local.z)); }
    let wn_raw = collider_local_to_world(grad_local, frame);
    let wn_len = length(wn_raw);
    if (wn_len < 1e-8) {
        deactivate(ctx.slot);
        return;
    }
    let wn = wn_raw / wn_len;
    write_contact_or_deactivate(ctx, wn, d, test_world, r_body, sphere_radius_offset);
}

// Para SphereCollider — frame contém center; raio é parâmetro escalar.
fn narrowphase_body_vs_sphere(ctx: TestContext, sphere_center_world: vec3f, sphere_r: f32) {
    let world_cm = bodies[ctx.rb_i].pos_pred.xyz;
    let rot_pred = bodies[ctx.rb_i].rot_pred;
    var test_world:           vec3f;
    var r_body:               vec3f = vec3f(0.0);
    var d:                    f32;
    var sphere_radius_offset: f32 = 0.0;
    var diff_world:           vec3f;

    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        let he = bodies[ctx.rb_i].body_shape.yzw;
        var corners: array<vec3f, 8>;
        box_corners_world(world_cm, rot_pred, he, &corners);
        var best_d:     f32   = 1e30;
        var best_world: vec3f = corners[0];
        var best_diff:  vec3f = corners[0] - sphere_center_world;
        for (var k: u32 = 0u; k < 8u; k++) {
            let diff = corners[k] - sphere_center_world;
            let cd   = length(diff) - sphere_r;
            if (cd < best_d) {
                best_d     = cd;
                best_world = corners[k];
                best_diff  = diff;
            }
        }
        test_world = best_world;
        diff_world = best_diff;
        d          = best_d;
        r_body     = test_world - world_cm;
    } else {
        let body_r = bodies[ctx.rb_i].body_shape.y;
        diff_world = world_cm - sphere_center_world;
        let dist   = length(diff_world);
        d          = dist - sphere_r - body_r;
        test_world = world_cm;
        sphere_radius_offset = body_r;
    }
    let dl = length(diff_world);
    if (dl < 1e-8) {
        deactivate(ctx.slot);
        return;
    }
    let wn = diff_world / dl;
    write_contact_or_deactivate(ctx, wn, d, test_world, r_body, sphere_radius_offset);
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry points por variante de collider. Cada um declara seu pool no próprio
// binding (5/6/7/8) — pipeline layout é inferido pelo entry point, cada
// pipeline binda apenas o pool da sua variante.
// ═══════════════════════════════════════════════════════════════════════════

@group(0) @binding(5) var<storage, read> planes:  array<PlaneCollider>;
@group(0) @binding(6) var<storage, read> boxes:   array<BoxCollider>;
@group(0) @binding(7) var<storage, read> spheres: array<SphereCollider>;
@group(0) @binding(8) var<storage, read> meshes:  array<MeshCollider>;

fn make_ctx(idx: u32) -> TestContext {
    let rb_i  = idx / np_params.pool_count;
    let col_j = idx % np_params.pool_count;
    // Layout do contacts: por body, linhas contíguas de tamanho total_col_count.
    // Cada pool ocupa uma faixa [pool_base, pool_base + pool_count) da linha.
    let slot  = rb_i * np_params.total_col_count + np_params.pool_base + col_j;
    let owner = body_owners[col_j];
    let is_dyn = owner < rb_params.body_count;
    let body_shape = u32(bodies[rb_i].body_shape.x);
    return TestContext(rb_i, slot, owner, is_dyn, body_shape);
}

@compute @workgroup_size(64)
fn rb_narrowphase_plane_main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= rb_params.body_count * np_params.pool_count) { return; }
    let ctx = make_ctx(idx);
    if (!precheck_pair(ctx, 2u)) { return; }
    let col_j = idx % np_params.pool_count;
    let plane = planes[col_j];
    let normal = normalize(plane.normal.xyz);
    narrowphase_body_vs_plane(ctx, normal, plane.offset);
}

@compute @workgroup_size(64)
fn rb_narrowphase_box_main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= rb_params.body_count * np_params.pool_count) { return; }
    let ctx = make_ctx(idx);
    if (!precheck_pair(ctx, 1u)) { return; }
    let col_j = idx % np_params.pool_count;
    let box = boxes[col_j];
    var frame: ColliderFrame;
    if (ctx.is_dynamic_col) {
        frame = collider_frame_dynamic(ctx.owner_rb, box.center.xyz);
    } else {
        frame = collider_frame_static(box.center.xyz);
    }
    narrowphase_body_vs_box(ctx, frame, box.halfExtents.xyz);
}

@compute @workgroup_size(64)
fn rb_narrowphase_sphere_main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= rb_params.body_count * np_params.pool_count) { return; }
    let ctx = make_ctx(idx);
    if (!precheck_pair(ctx, 0u)) { return; }
    let col_j = idx % np_params.pool_count;
    let sph = spheres[col_j];
    var center_world: vec3f;
    if (ctx.is_dynamic_col) {
        center_world = bodies[ctx.owner_rb].pos_pred.xyz
                     + quat_rotate_vec(bodies[ctx.owner_rb].rot_pred, sph.center.xyz);
    } else {
        center_world = sph.center.xyz;
    }
    narrowphase_body_vs_sphere(ctx, center_world, sph.radius);
}

@compute @workgroup_size(64)
fn rb_narrowphase_mesh_main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= rb_params.body_count * np_params.pool_count) { return; }
    let ctx = make_ctx(idx);
    // MeshCollider triangle-by-triangle narrowphase é trabalho separado;
    // por ora, desativa slot (não gera contatos com mesh).
    let _unused = meshes[idx % np_params.pool_count];
    deactivate(ctx.slot);
}
