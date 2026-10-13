import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Tipo de projeção da câmera. */
export type CameraProjection = 'perspective' | 'orthographic';

/** De onde vem a razão de aspecto: do canvas (acompanha o redimensionamento) ou o valor `aspect` fixo. */
export type CameraAspectMode = 'canvas' | 'fixed';

/** Valores de construção de uma `Camera` (todos opcionais). */
export interface CameraValues {
    /** Projeção. Default `'perspective'`. */
    readonly projection?: CameraProjection;
    /** Campo de visão vertical em radianos (perspectiva). Default `π/4`. */
    readonly fov?: number;
    /** Altura visível em unidades de mundo (ortográfica). Default 10. */
    readonly orthoHeight?: number;
    /** Plano próximo. Default 0,1. */
    readonly near?: number;
    /** Plano distante. Default 1000. */
    readonly far?: number;
    /** Razão de aspecto usada com `aspectMode: 'fixed'`. Default 16/9. */
    readonly aspect?: number;
    /** Origem da razão de aspecto. Default `'canvas'`. */
    readonly aspectMode?: CameraAspectMode;
}

/** Dado de uma `Camera` (layout de `Camera.schema`). */
export interface CameraData {
    projection: number;
    aspectMode: number;
    fov: number;
    orthoHeight: number;
    near: number;
    far: number;
    aspect: number;
    _pad0: number;
}

/**
 * Câmera — os **parâmetros** de projeção (spec 007). Posição e orientação vêm do `Transform` da mesma entidade
 * (obrigatório: a câmera olha para −Z local; `Transform.lookRotation` mira um ponto); os controllers mutam esse
 * `Transform`. View, projection e viewProjection são produzidas na GPU pelo `CameraFlow`, num segundo descritor do
 * mesmo recurso (pool `CameraMatrices`, mesmo slot), que o render principal lê.
 *
 * ```ts
 * const camera = new Camera({ fov: Math.PI / 4 });
 * camera.add(new Transform({ position: [0, 3, 6, 1], rotation: Transform.lookRotation([0, 3, 6], [0, 0, 0]) }));
 * app.world.insert(camera);
 * ```
 *
 * Mudança incompatível: as matrizes (`view`, `projection`, `viewProjection`, `position`) não são mais dado da câmera
 * — ver o guia de migração.
 */
export class Camera extends Entity<CameraData> implements Resource {
    /** Parâmetros de projeção (pool `Camera`). `projection`: 0 perspectiva, 1 ortográfica; `aspectMode`: 0 canvas, 1 fixo. */
    static readonly schema = new StructSchema('Camera', {
        projection: FieldType.u32,
        aspectMode: FieldType.u32,
        fov: FieldType.f32,
        orthoHeight: FieldType.f32,
        near: FieldType.f32,
        far: FieldType.f32,
        aspect: FieldType.f32,
        _pad0: FieldType.f32,
    });

    /** Produto do `CameraFlow`, só na GPU (pool `CameraMatrices`, mesmo slot da câmera). */
    static readonly matricesSchema = new StructSchema('CameraMatrices', {
        view: FieldType.mat4x4f,
        projection: FieldType.mat4x4f,
        viewProjection: FieldType.mat4x4f,
        position: FieldType.vec4f,
    });

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: CameraValues = {}) {
        super();
        this.data = {
            projection: values.projection === 'orthographic' ? 1 : 0,
            aspectMode: values.aspectMode === 'fixed' ? 1 : 0,
            fov: values.fov ?? Math.PI / 4,
            orthoHeight: values.orthoHeight ?? 10,
            near: values.near ?? 0.1,
            far: values.far ?? 1000,
            aspect: values.aspect ?? 16 / 9,
            _pad0: 0,
        };
    }

    /** Parâmetros (CPU envia a cada mutação) + matrizes (produzidas só pela GPU). */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'camera', role: 'storage-ro', storage: 'pool', schema: Camera.schema },
            {
                id: 'matrices',
                role: 'storage-rw',
                storage: 'pool',
                schema: Camera.matricesSchema,
                upload: 'never',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
