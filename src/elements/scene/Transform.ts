import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Vetor homogêneo `[x, y, z, w]`. */
type Vec4 = readonly [number, number, number, number] | number[];

/** Valores de construção de um `Transform` (todos opcionais). */
export interface TransformValues {
    /** Posição no mundo `[x, y, z, 1]`. Default `[0, 0, 0, 1]`. */
    readonly position?: Vec4;
    /** Rotação como quaternion `[x, y, z, w]`. Default identidade `[0, 0, 0, 1]`. */
    readonly rotation?: Vec4;
    /** Escala por eixo `[sx, sy, sz, 1]`. Default `[1, 1, 1, 1]`; negativa espelha. */
    readonly scale?: Vec4;
}

let legacyModelWarned = false;

/**
 * Transform 3D — a **intenção** de posicionamento de um objeto: posição, rotação
 * (quaternion) e escala. Mutar `data` depois de inserir reposiciona o objeto no
 * quadro seguinte, sem chamadas manuais.
 *
 * A matriz de mundo não é dado do desenvolvedor: é produzida na GPU pelo
 * `TransformFlow` (fase `transform`) num segundo descritor do mesmo recurso
 * (`WorldTransform`, mesmo slot), e lida pelos estágios de sombra e desenho.
 *
 * Mudança incompatível: o antigo campo `model` foi removido — ver o guia de migração.
 */
export class Transform extends Entity implements Resource {
    /** Intenção do desenvolvedor: posição, rotação e escala (pool `Transform`). */
    static readonly schema = new StructSchema('Transform', {
        position: FieldType.vec4f,
        rotation: FieldType.vec4f,
        scale: FieldType.vec4f,
    });

    /**
     * Produto do estágio de transformação, só na GPU (pool `WorldTransform`):
     * `world = T·R·S` e `normal = R·S⁻¹` (matriz para normais).
     */
    static readonly worldSchema = new StructSchema('WorldTransform', {
        world: FieldType.mat4x4f,
        normal: FieldType.mat3x3f,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(values: TransformValues = {}) {
        super();
        if ('model' in values) warnLegacyModel();
        this.data = {
            position: [...(values.position ?? [0, 0, 0, 1])],
            rotation: [...(values.rotation ?? [0, 0, 0, 1])],
            scale: [...(values.scale ?? [1, 1, 1, 1])],
        };
    }

    /** Intenção (CPU envia a cada mutação) + matriz de mundo (produzida só pela GPU). */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'transform',
                role: 'storage-ro',
                storage: 'pool',
                schema: Transform.schema,
                upload: 'always',
            },
            {
                id: 'world',
                role: 'storage-rw',
                storage: 'pool',
                schema: Transform.worldSchema,
                upload: 'never',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Reabilita o aviso de `model` legado (uso em testes). */
    static resetLegacyModelWarning(): void {
        legacyModelWarned = false;
    }
}

function warnLegacyModel(): void {
    if (legacyModelWarned) return;
    legacyModelWarned = true;
    console.warn(
        '[Transform] O campo `model` foi removido e será ignorado: o posicionamento é por '
            + '`position`/`rotation`/`scale`, e a matriz de mundo é produzida na GPU pelo '
            + 'TransformFlow. Veja o guia de migração.',
    );
}
