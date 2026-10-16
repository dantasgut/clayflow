import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';

/**
 * Base dos materiais de render; `TData` tipa o `data` (ver `Entity`). O material decide como a geometria é desenhada
 * (spec 008): a `topology` do seu descritor de pipeline (triângulos, linhas ou pontos) e se projeta sombra.
 */
export abstract class Material<TData extends object = Record<string, unknown>>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;
    private castsShadowOverride: boolean | undefined = undefined;

    abstract getDescriptors(): readonly GPUDescriptor[];
    abstract getPipelineDescriptors(): readonly PipelineDescriptor[];

    /** Topologia do desenho: a do descritor de pipeline do material (padrão `'triangle-list'`). */
    get topology(): GPUPrimitiveTopology {
        return this.getPipelineDescriptors()[0]?.topology ?? 'triangle-list';
    }

    /**
     * Família de desenho (spec 031): o estágio que desenha as entidades com este material escolhe por ela (`surface`,
     * `points`, `wire`, `fluid-surface`…), sem conhecer outros tipos. Padrão: a do descritor de pipeline do material.
     */
    get family(): string | undefined {
        return this.getPipelineDescriptors()[0]?.family;
    }

    /**
     * O material desenha corpos de partículas (sprites, superfície de água)? Um corpo de partículas com material que
     * não desenha corpos fica fora do desenho, com aviso. Padrão: não.
     */
    get drawsParticles(): boolean {
        return false;
    }

    /**
     * Projeta sombra? Padrão: só triângulos (linhas e sprites não projetam). Atribuir antes de inserir na cena: a
     * escolha entra nos grupos de desenho na inserção.
     */
    get castsShadow(): boolean {
        return this.castsShadowOverride ?? this.topology === 'triangle-list';
    }

    /** Define se o material projeta sombra (vale sobre o padrão da topologia). */
    set castsShadow(value: boolean) {
        this.castsShadowOverride = value;
    }
}
