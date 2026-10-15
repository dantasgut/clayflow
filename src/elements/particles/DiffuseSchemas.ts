import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Partícula secundária de um fluido (spec 010): posição e tipo (w: 0 spray, 1 espuma, 2 bolha); velocidade e vida (w). */
export const DiffuseParticleSchema = new StructSchema('DiffuseParticle', {
    pos: FieldType.vec4f,
    vel: FieldType.vec4f,
});

/**
 * Parâmetros das partículas secundárias de um quadro (spec 010): faixa e layout do fluido no pool, busca de vizinhos e
 * grade, anel, potenciais de geração (limiares e ganhos de Ihmsen 2012), dinâmica de cada tipo e caixa do domínio.
 */
export const DiffuseParamsSchema = new StructSchema(
    'DiffuseParams',
    {
        fluid_count: FieldType.u32,
        fluid_stride: FieldType.u32,
        pos_offset: FieldType.u32,
        vel_offset: FieldType.u32,
        max_neighbors: FieldType.u32,
        list_stride: FieldType.u32,
        capacity: FieldType.u32,
        frame: FieldType.u32,
        grid_x: FieldType.u32,
        grid_y: FieldType.u32,
        grid_z: FieldType.u32,
        spray_max: FieldType.u32,
        grid_origin: FieldType.vec3f,
        cell_size: FieldType.f32,
        gravity: FieldType.vec3f,
        dt: FieldType.f32,
        bound_min: FieldType.vec3f,
        h: FieldType.f32,
        bound_max: FieldType.vec3f,
        bubble_min: FieldType.u32,
        ta_min: FieldType.f32,
        ta_max: FieldType.f32,
        wc_min: FieldType.f32,
        wc_max: FieldType.f32,
        k_min: FieldType.f32,
        k_max: FieldType.f32,
        k_ta: FieldType.f32,
        k_wc: FieldType.f32,
        lifetime: FieldType.f32,
        air_drag: FieldType.f32,
        buoyancy: FieldType.f32,
        bubble_drag: FieldType.f32,
        spawn_radius: FieldType.f32,
        spawn_spread: FieldType.f32,
        spray_aging: FieldType.f32,
        time: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
