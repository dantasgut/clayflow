import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Dado de uma luz (layout de `Light.schema`, comum a todos os tipos). */
export interface LightData {
    /** Tipo (código numérico do layout). */
    kind: number;
    /** Projeta sombra (1/0 no layout; booleano nos valores). */
    castShadow: number;
    /** Intensidade: lux na direcional; candela na pontual e na spot (spec 011). */
    intensity: number;
    /** Alcance (pontual e spot): a luz vai a zero suavemente até ele; 0 = sem alcance. */
    range: number;
    /** Posição. */
    position: number[];
    /** Direção. */
    direction: number[];
    /** Cor RGBA linear. */
    color: number[];
    /**
     * Cones da spot em radianos (`[interno, externo, 0, 0]`); na direcional, `z` é o diâmetro angular da fonte (rad,
     * spec 034: a penumbra); zeros no resto.
     */
    cones: number[];
}

/** Valores do construtor das luzes: os campos do dado exceto `kind`, com `castShadow` booleano. */
export interface LightValues extends Partial<Omit<LightData, 'kind' | 'castShadow' | 'cones'>> {
    /** Projeta sombra (1/0 no layout; booleano nos valores). */
    castShadow?: boolean;
}

/**
 * Base dos tipos de luz (`DirectionalLight`, `PointLight`, `SpotLight`): um struct comum num pool, lido pela
 * contribuição das luzes ao ponto de cena `scene_lighting` (spec 011) — o desenho não conhece nenhuma classe de luz.
 * Cor e intensidade em unidades físicas: lux na direcional, candela na pontual e na spot.
 *
 * `kind`: 0 = direcional, 1 = pontual, 2 = spot.
 */
export abstract class Light extends Entity<LightData> implements Resource {
    /** Schema unified — todos os tipos de light usam o mesmo layout. */
    static readonly schema = new StructSchema('Light', {
        kind: FieldType.u32,
        castShadow: FieldType.u32,
        intensity: FieldType.f32,
        range: FieldType.f32,
        position: FieldType.vec4f,
        direction: FieldType.vec4f,
        color: FieldType.vec4f,
        cones: FieldType.vec4f,
    });

    state: ResourceState = ResourceState.Uninitialized;

    /** Pool de leitura: a contribuição das luzes itera os slots vivos. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'light',
                role: 'storage-ro',
                schema: Light.schema,
                storage: 'pool',
                // Slot liberado volta a zero (intensidade 0): quem percorre o pool sem o bitset de vivos (os acertos da
                // iluminação global, spec 033) não ilumina com uma luz que saiu.
                clearOnRelease: true,
            },
        ];
    }

    /** Sem pipelines próprios: a luz é dado, a contribuição de cena é quem itera. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
