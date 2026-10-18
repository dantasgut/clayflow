import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Voxels por lado de um bloco do campo (o interior). */
export const FIELD_BRICK = 8;
/** Voxels de borda de cada lado (a amostra tricúbica cabe num bloco só). */
export const FIELD_APRON = 2;
/** Voxels por lado de um bloco com a borda. */
export const FIELD_BRICK_STRIDE = FIELD_BRICK + 2 * FIELD_APRON;
/** Voxels do interior de um bloco. */
export const FIELD_BRICK_VOXELS = FIELD_BRICK ** 3;
/** Voxels de um bloco com a borda. */
export const FIELD_BRICK_APRON_VOXELS = FIELD_BRICK_STRIDE ** 3;
/** Partículas por bloco na capacidade de blocos (a capacidade é as partículas divididas por isto). */
export const FIELD_PARTICLES_PER_BRICK = 8;

/**
 * Parâmetros do campo dos fluidos (uniform, spec 033, R11): `sizes` = (partículas, capacidade de blocos, máscara da
 * tabela, iterações da eikonal); `grid` = (espaçamento, voxel, raio do núcleo, faixa útil); `tuning` = (suavização, razão máxima, raio dos
 * núcleos esparsos em fração, nível da superfície); `limits` = (vizinhos do núcleo anisotrópico, sondagens da tabela,
 * 0, 0).
 */
export const FluidFieldSchema = new StructSchema(
    'FluidFieldParams',
    {
        sizes: FieldType.vec4u,
        grid: FieldType.vec4f,
        tuning: FieldType.vec4f,
        limits: FieldType.vec4u,
        /** x: 1 quando a simulação avançou no quadro (o nível da superfície se ajusta só então). */
        motion: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);

/**
 * Corpo de partículas na junção (uma região por corpo, offset dinâmico): o primeiro slot no pool, o stride do registro e
 * o deslocamento de `pos` em `vec4f`, as partículas, o início no array compacto e o slot do material.
 */
export const FieldGatherSchema = new StructSchema(
    'FieldGather',
    {
        first: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        count: FieldType.u32,
        base: FieldType.u32,
        materialSlot: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Palavra de 32 bits (os buffers crus do campo: chaves, slots, contagens; o tamanho do descritor). */
export const FieldWordSchema = new StructSchema('FieldWord', { value: FieldType.u32 });
