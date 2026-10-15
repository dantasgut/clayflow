import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

// Parâmetros por iteração dos estágios de física (uniform, uma região por iteração em `PerStepUniforms`). Cada schema
// é a fonte única do struct WGSL correspondente e do empacotamento (spec 005, R5).

/** XPBD de partículas. */
export const SimParamsSchema = new StructSchema(
    'SimParams',
    {
        gravity: FieldType.vec3f,
        dt: FieldType.f32,
        restitution: FieldType.f32,
        damping: FieldType.f32,
        particle_radius: FieldType.f32,
        particle_count: FieldType.u32,
        constraint_count: FieldType.u32,
        collider_count: FieldType.u32,
        shape_stiffness: FieldType.f32,
        collision_radius: FieldType.f32,
        /** Tempo simulado do passo (s) — o que as funções dos campos recebem (spec 009). */
        field_time: FieldType.f32,
        /** Densidade do corpo para os campos (empuxo); 0 = sem densidade (spec 009). */
        field_density: FieldType.f32,
        _field_pad0: FieldType.f32,
        _field_pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** FEM. */
export const FEMSimParamsSchema = new StructSchema(
    'FEMSimParams',
    {
        gravity: FieldType.vec3f,
        dt_sub: FieldType.f32,
        mu: FieldType.f32,
        lambda: FieldType.f32,
        damping: FieldType.f32,
        collision_radius: FieldType.f32,
        alpha_h: FieldType.f32,
        alpha_d: FieldType.f32,
        dt_frame: FieldType.f32,
        restitution: FieldType.f32,
        collider_count: FieldType.u32,
        node_count: FieldType.u32,
        elem_count: FieldType.u32,
        solve_iters: FieldType.u32,
        rb_count: FieldType.u32,
        _fsp_pad1: FieldType.u32,
        _fsp_pad2: FieldType.u32,
        _fsp_pad3: FieldType.u32,
        /** Tempo simulado do passo (s) — o que as funções dos campos recebem (spec 009). */
        field_time: FieldType.f32,
        /** Densidade do corpo para os campos (empuxo); 0 = sem densidade (spec 009). */
        field_density: FieldType.f32,
        _field_pad0: FieldType.f32,
        _field_pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** MLS-MPM (fluido e sólido). Massa, volume, K e Lamé vêm do `ParticleMaterial`. */
export const MPMSimParamsSchema = new StructSchema(
    'MPMSimParams',
    {
        gravity: FieldType.vec3f,
        dt_sub: FieldType.f32,
        mu: FieldType.f32,
        lambda_lame: FieldType.f32,
        fixed_scale: FieldType.f32,
        particle_mass: FieldType.f32,
        particle_volume: FieldType.f32,
        bulk_modulus: FieldType.f32,
        viscosity: FieldType.f32,
        dt_frame: FieldType.f32,
        particle_count: FieldType.u32,
        grid_x: FieldType.u32,
        grid_y: FieldType.u32,
        grid_z: FieldType.u32,
        grid_origin: FieldType.vec3f,
        cell_size: FieldType.f32,
        _reserved0: FieldType.u32,
        material_id: FieldType.u32,
        substep_count: FieldType.u32,
        inv_dx: FieldType.f32,
        /** Tempo simulado do passo (s) — o que as funções dos campos recebem (spec 009). */
        field_time: FieldType.f32,
        /** Densidade do corpo para os campos (empuxo); 0 = sem densidade (spec 009). */
        field_density: FieldType.f32,
        _field_pad0: FieldType.f32,
        _field_pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** SPH fracamente compressível (Tait). */
export const SPHSimParamsSchema = new StructSchema(
    'SPHSimParams',
    {
        gravity: FieldType.vec3f,
        dt: FieldType.f32,
        rest_density: FieldType.f32,
        h: FieldType.f32,
        stiffness: FieldType.f32,
        gamma: FieldType.f32,
        viscosity: FieldType.f32,
        xsph_c: FieldType.f32,
        dt_frame: FieldType.f32,
        collision_radius: FieldType.f32,
        particle_count: FieldType.u32,
        max_neighbors: FieldType.u32,
        restitution: FieldType.f32,
        bound_min: FieldType.vec3f,
        particle_mass: FieldType.f32,
        inv_particle_mass: FieldType.f32,
        /** Passo da lista de vizinhos intercalada (`k * neighbor_stride + i`). */
        neighbor_stride: FieldType.u32,
        /** γ da tensão superficial de Akinci (0 = desligada; spec 030). */
        cohesion_gamma: FieldType.f32,
        /** Escala da adesão às fronteiras, m/s² (0 = desligada; spec 030). */
        adhesion_accel: FieldType.f32,
        /** Arrasto tangencial da adesão no contato, 1/s (spec 030). */
        adhesion_tangential: FieldType.f32,
        /** Suporte H da vizinhança (2h no SPH, h no PBF): alcance da coesão e da adesão (spec 030). */
        support: FieldType.f32,
        /** Tempo simulado do passo (s) — o que as funções dos campos recebem (spec 009). */
        field_time: FieldType.f32,
        /** Densidade do corpo para os campos (empuxo); 0 = sem densidade (spec 009). */
        field_density: FieldType.f32,
        _field_pad0: FieldType.f32,
        _field_pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** Position Based Fluids (Macklin & Müller 2013). */
export const PBFSimParamsSchema = new StructSchema(
    'PBFSimParams',
    {
        gravity: FieldType.vec3f,
        dt: FieldType.f32,
        rest_density: FieldType.f32,
        h: FieldType.f32,
        relaxation: FieldType.f32,
        s_corr_k: FieldType.f32,
        s_corr_n: FieldType.f32,
        vorticity_eps: FieldType.f32,
        xsph_c: FieldType.f32,
        dt_frame: FieldType.f32,
        particle_count: FieldType.u32,
        max_neighbors: FieldType.u32,
        restitution: FieldType.f32,
        collision_radius: FieldType.f32,
        bound_min: FieldType.vec3f,
        particle_mass: FieldType.f32,
        mass_over_density: FieldType.f32,
        /** Passo da lista de vizinhos intercalada (`k * neighbor_stride + i`). */
        neighbor_stride: FieldType.u32,
        /** γ da tensão superficial de Akinci (0 = desligada; spec 030). */
        cohesion_gamma: FieldType.f32,
        /** Escala da adesão às fronteiras, m/s² (0 = desligada; spec 030). */
        adhesion_accel: FieldType.f32,
        /** Arrasto tangencial da adesão no contato, 1/s (spec 030). */
        adhesion_tangential: FieldType.f32,
        /** Suporte H da vizinhança (2h no SPH, h no PBF): alcance da coesão e da adesão (spec 030). */
        support: FieldType.f32,
        /** Tempo simulado do passo (s) — o que as funções dos campos recebem (spec 009). */
        field_time: FieldType.f32,
        /** Densidade do corpo para os campos (empuxo); 0 = sem densidade (spec 009). */
        field_density: FieldType.f32,
        _field_pad0: FieldType.f32,
        _field_pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** LCP de corpos rígidos. */
export const RBSimParamsSchema = new StructSchema(
    'RBSimParams',
    {
        gravity: FieldType.vec4f,
        body_count: FieldType.u32,
        collider_count: FieldType.u32,
        max_contacts: FieldType.u32,
        solve_iters: FieldType.u32,
        dt_frame: FieldType.f32,
        restitution: FieldType.f32,
        penetration_slop: FieldType.f32,
        linear_damping: FieldType.f32,
        angular_damping: FieldType.f32,
        contact_stamp: FieldType.u32,
        predictive_threshold: FieldType.f32,
        restitution_threshold: FieldType.f32,
        sleep_lin_threshold: FieldType.f32,
        warm_capacity: FieldType.u32,
        baumgarte_beta: FieldType.f32,
        warm_start_factor: FieldType.f32,
        /** Tempo simulado do passo (s) — o que as funções dos campos recebem (spec 009). */
        field_time: FieldType.f32,
        /** Densidade do corpo para os campos (empuxo); 0 = sem densidade (spec 009). */
        field_density: FieldType.f32,
        _field_pad0: FieldType.f32,
        _field_pad1: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** Narrowphase do LCP: pool de collider corrente e posição dele na linha de contatos do corpo. */
export const NarrowphaseParamsSchema = new StructSchema(
    'NarrowphaseParams',
    {
        pool_count: FieldType.u32,
        pool_base: FieldType.u32,
        total_col_count: FieldType.u32,
        _pad0: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
