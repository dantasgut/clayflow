// Narrowphase em 4 variantes, uma por pool de Collider da Camada 3.
// Cada variante reusa a mesma lógica matemática (SDF, gradiente, supressão,
// predictive contact, warm-starting) mudando apenas o struct do pool de
// collider lido e a função de SDF específica da shape.
//
// Lê de: bodies (pool RigidBody:LCP), body_owners (mapa CPU: collider_slot →
// rb_idx do owner, 0xFFFFFFFFu se estático), e pool tipado de colliders.
// Escreve em: lista compactada `contacts` — cada contato reserva um índice por `atomic_alloc` (spec 004,
// R19); o par é identificado por `slot = rb_i * total_col + pool_base + col_j` (id do par) e o contato por
// (par, feature): caixa gera um contato por canto (manifold), esfera um só.
//
// Dispatch: workgroup_size=64, threads = body_count * pool_count.
// LCPFlow dispatcha por pool quando count > 0.

@group(0) @binding(0) var<uniform>             rb_params:   RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:      array<RigidBody>;
@group(0) @binding(2) var<uniform>             np_params:   NarrowphaseParams;
@group(0) @binding(3) var<storage, read>       body_owners: array<u32>;
@group(0) @binding(4) var<storage, read_write> contacts:    array<RBContact>;
@group(0) @binding(9)  var<storage, read_write> contact_counter: AtomicAllocCounter;
@group(0) @binding(10) var<storage, read_write> warm_table:      array<RBWarmEntry>;
// Contatos por corpo neste substep (divisão de massa do solve Jacobi) — zerado antes da narrowphase.
@group(0) @binding(11) var<storage, read_write> body_split:      array<atomic<u32>>;

// Binding 5: pool específico da variante — declarado por kernel via concat WGSL no TS.

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

// Impulsos do contato (par, feature) gravados pelo solver no substep anterior (região da paridade anterior da
// tabela — warm start); zero se ausentes.
fn warm_start_of(pair: u32, feature: u32) -> vec3f {
    let capacity = rb_params.warm_capacity;
    if (capacity == 0u) { return vec3f(0.0); }
    let region = rb_warm_region(rb_params.contact_stamp + 1u, capacity);
    let key  = rb_warm_key(pair, feature);
    let home = rb_warm_home(key, capacity);
    for (var p = 0u; p < RB_WARM_PROBES; p++) {
        let s = region + ((home + p) & (capacity - 1u));
        let k = atomicLoad(&warm_table[s].key);
        if (k == 0u) { break; }
        if (k == key) {
            return vec3f(warm_table[s].lambda_n, warm_table[s].lambda_tx, warm_table[s].lambda_ty);
        }
    }
    return vec3f(0.0);
}

// Pré-validação compartilhada: cinemático, self-collision, supressão dynamic-dynamic.
// Retorna true se o par deve continuar processando; false se não gera contato.
fn precheck_pair(ctx: TestContext, collider_shape_rank: u32) -> bool {
    let inv_mass = bodies[ctx.rb_i].pos.w;
    if (inv_mass == 0.0) { return false; }
    if (ctx.is_dynamic_col && ctx.owner_rb == ctx.rb_i) { return false; }
    // Supressão canônica dynamic-dynamic: par secundário é desativado para evitar
    // aplicar impulso 2× (A→B e B→A). Critério: (body_shape, owner_idx).
    if (ctx.is_dynamic_col) {
        let inv_mass_b = bodies[ctx.owner_rb].pos.w;
        if (inv_mass_b > 0.0) {
            let col_body_shape = u32(bodies[ctx.owner_rb].body_shape.x);
            if (ctx.body_shape_type > col_body_shape
             || (ctx.body_shape_type == col_body_shape && ctx.rb_i > ctx.owner_rb)) {
                return false;
            }
        }
    }
    return true;
}

// Profundidade efetiva do ponto de teste: SDF real se penetra; especulativa (d + v_n·dt) se vai penetrar neste
// substep com contato preditivo ligado. `hit` = false quando o ponto não gera contato.
struct ContactDepth {
    hit:       bool,
    depth_eff: f32,
}

fn contact_depth(ctx: TestContext, wn: vec3f, d: f32, r_body: vec3f) -> ContactDepth {
    var v_test: vec3f;
    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        v_test = bodies[ctx.rb_i].vel.xyz + cross(bodies[ctx.rb_i].omega.xyz, r_body);
    } else {
        v_test = bodies[ctx.rb_i].vel.xyz;
    }
    let d_speculative = d + dot(v_test, wn) * rb_params.gravity.w;  // gravity.w = dtSub
    let predictive_on = rb_params.predictive_threshold > 0.0;
    if (d >= 0.0 && (d_speculative >= 0.0 || !predictive_on)) { return ContactDepth(false, 0.0); }
    return ContactDepth(true, select(d, d_speculative, d >= 0.0));
}

// Reserva um índice na lista compactada e grava o RBContact.
// `wn`  — normal mundo unitária (aponta para fora do collider).
// `d`   — SDF real (negativo = penetração); `depth_eff` — de contact_depth.
// `test_world` — ponto de teste em mundo.
// `sphere_radius_offset` — raio da esfera quando body_shape=sphere (0 em outros casos).
// `feature` — canto da caixa (0 para esfera); `weight` — 1 / contatos do par (correção posicional).
fn emit_contact(ctx: TestContext, wn: vec3f, d: f32, depth_eff: f32, test_world: vec3f,
                sphere_radius_offset: f32, feature: u32, weight: f32) {
    let contact_point = test_world - (depth_eff + sphere_radius_offset) * wn;

    let k = atomic_alloc(&contact_counter, rb_params.max_contacts);
    if (k == ATOMIC_ALLOC_FULL) { return; }
    let warm = warm_start_of(ctx.slot, feature);
    atomicAdd(&body_split[ctx.rb_i], 1u);
    if (ctx.is_dynamic_col && bodies[ctx.owner_rb].pos.w > 0.0) {
        atomicAdd(&body_split[ctx.owner_rb], 1u);
    }

    contacts[k].normal      = vec4f(wn, -depth_eff);
    contacts[k].point       = vec4f(contact_point, warm.x);
    contacts[k].rb_idx      = ctx.rb_i;
    contacts[k].col_idx     = ctx.slot;
    contacts[k].is_active   = 1u;
    contacts[k].rb_idx_b    = ctx.owner_rb;
    contacts[k].lambda_tx   = warm.y;
    contacts[k].lambda_ty   = warm.z;
    let rest_a = bodies[ctx.rb_i].mat_props.x;
    let rest_b = select(0.0, bodies[ctx.owner_rb].mat_props.x, ctx.is_dynamic_col);
    contacts[k].restitution  = combine_restitution(rest_a, rest_b);
    contacts[k].diagonal_n   = 1.0;
    contacts[k].diagonal_t1  = 1.0;
    contacts[k].diagonal_t2  = 1.0;
    contacts[k]._pad3        = d;
    contacts[k].weight       = weight;
    contacts[k].rolling      = vec3f(0.0);
    contacts[k].feature      = feature;
}

// Contato de ponto único (esfera, ou caixa contra esfera): feature 0, peso 1.
fn emit_single(ctx: TestContext, wn: vec3f, d: f32, test_world: vec3f, r_body: vec3f,
               sphere_radius_offset: f32) {
    let cd = contact_depth(ctx, wn, d, r_body);
    if (!cd.hit) { return; }
    emit_contact(ctx, wn, d, cd.depth_eff, test_world, sphere_radius_offset, 0u, 1.0);
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
    let world_cm  = bodies[ctx.rb_i].pos_pred.xyz;
    let rot_pred  = bodies[ctx.rb_i].rot_pred;

    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        // Manifold: um contato por canto que penetra (ou vai penetrar no substep) — a face apoiada fica sustentada
        // pelos seus cantos, sem torque espúrio nem balanço entre cantos.
        let he = bodies[ctx.rb_i].body_shape.yzw;
        var corners: array<vec3f, 8>;
        box_corners_world(world_cm, rot_pred, he, &corners);
        var depths: array<f32, 8>;
        var n_active = 0u;
        for (var k: u32 = 0u; k < 8u; k++) {
            let cd = contact_depth(ctx, normal, sdf_plane(corners[k], normal, offset), corners[k] - world_cm);
            depths[k] = select(1e30, cd.depth_eff, cd.hit);
            if (cd.hit) { n_active++; }
        }
        if (n_active == 0u) { return; }
        let weight = 1.0 / f32(n_active);
        for (var k: u32 = 0u; k < 8u; k++) {
            if (depths[k] >= 1e30) { continue; }
            emit_contact(ctx, normal, sdf_plane(corners[k], normal, offset), depths[k], corners[k], 0.0, k, weight);
        }
        return;
    }
    let radius = bodies[ctx.rb_i].body_shape.y;
    emit_single(ctx, normal, sdf_plane(world_cm, normal, offset) - radius, world_cm, vec3f(0.0), radius);
}

// Para BoxCollider — usa frame (estático: identity rot; dinâmico: owner rot).
// Normal mundo da face do box mais próxima do ponto local (gradiente analítico); zero se degenerada.
fn box_face_normal(test_local: vec3f, half: vec3f, frame: ColliderFrame) -> vec3f {
    let pen = half - abs(test_local);
    var grad_local: vec3f;
    if (pen.x <= pen.y && pen.x <= pen.z)      { grad_local = vec3f(sign(test_local.x), 0.0, 0.0); }
    else if (pen.y <= pen.z)                   { grad_local = vec3f(0.0, sign(test_local.y), 0.0); }
    else                                       { grad_local = vec3f(0.0, 0.0, sign(test_local.z)); }
    let wn_raw = collider_local_to_world(grad_local, frame);
    let wn_len = length(wn_raw);
    if (wn_len < 1e-8) { return vec3f(0.0); }
    return wn_raw / wn_len;
}

// Para BoxCollider — usa frame (estático: identity rot; dinâmico: owner rot).
fn narrowphase_body_vs_box(ctx: TestContext, frame: ColliderFrame, half: vec3f) {
    let world_cm = bodies[ctx.rb_i].pos_pred.xyz;
    let rot_pred = bodies[ctx.rb_i].rot_pred;

    if (ctx.body_shape_type == SHAPE_TYPE_BODY_BOX) {
        // Manifold: um contato por canto da caixa dentro (ou entrando no substep) do box collider, cada um com a
        // normal da face mais próxima do canto.
        let he = bodies[ctx.rb_i].body_shape.yzw;
        var corners: array<vec3f, 8>;
        box_corners_world(world_cm, rot_pred, he, &corners);
        var depths:  array<f32, 8>;
        var normals: array<vec3f, 8>;
        var sdfs:    array<f32, 8>;
        var n_active = 0u;
        for (var k: u32 = 0u; k < 8u; k++) {
            let cl = world_to_collider_local(corners[k], frame);
            let wn = box_face_normal(cl, half, frame);
            sdfs[k] = sdf_box(cl, half);
            normals[k] = wn;
            depths[k] = 1e30;
            if (dot(wn, wn) == 0.0) { continue; }
            let cd = contact_depth(ctx, wn, sdfs[k], corners[k] - world_cm);
            if (cd.hit) {
                depths[k] = cd.depth_eff;
                n_active++;
            }
        }
        if (n_active == 0u) { return; }
        let weight = 1.0 / f32(n_active);
        for (var k: u32 = 0u; k < 8u; k++) {
            if (depths[k] >= 1e30) { continue; }
            emit_contact(ctx, normals[k], sdfs[k], depths[k], corners[k], 0.0, k, weight);
        }
        return;
    }
    let radius     = bodies[ctx.rb_i].body_shape.y;
    let test_local = world_to_collider_local(world_cm, frame);
    let wn         = box_face_normal(test_local, half, frame);
    if (dot(wn, wn) == 0.0) { return; }
    emit_single(ctx, wn, sdf_box(test_local, half) - radius, world_cm, vec3f(0.0), radius);
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
        return;
    }
    let wn = diff_world / dl;
    emit_single(ctx, wn, d, test_world, r_body, sphere_radius_offset);
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
fn rb_narrowphase_plane_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
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
fn rb_narrowphase_box_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
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
fn rb_narrowphase_sphere_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
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
fn rb_narrowphase_mesh_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let idx = gid.x;
    if (idx >= rb_params.body_count * np_params.pool_count) { return; }
    // MeshCollider triangle-by-triangle narrowphase é trabalho separado;
    // por ora não gera contatos com mesh.
    let _unused = meshes[idx % np_params.pool_count];
}
