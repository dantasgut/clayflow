import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { EntityId } from '../../scene/world/EntityId';

/**
 * Hierarquia opcional de `Transform` (spec 007, research R12): componente da entidade filha que aponta para a entidade
 * pai. O estágio de transformação compõe a matriz de mundo do filho a partir da do pai já composta no mesmo quadro
 * (`world = world[pai] · T · R · S`), por níveis, na GPU. Sem nenhum `Parent` na cena, a composição é a de sempre (um
 * passe sobre o pool).
 *
 * Regras (verificadas quando a hierarquia muda): o pai precisa ter `Transform`; ciclos são erro que nomeia as
 * entidades; o `Transform` do filho não pode ser de posse da GPU (corpo rígido dinâmico: a pose é de mundo, escrita
 * pela física). Pai removido: o filho passa a ser raiz (matriz de mundo = local) com aviso. O pai é fixo enquanto a
 * entidade está na cena (o dado não é observado depois da inserção): para trocá-lo, remova e reinsira a entidade com
 * outro `Parent`.
 *
 * ```ts
 * const arm = app.world.insert(new BoxGeometry().add(new Transform({ position: [0, 1, 0, 1] })));
 * app.world.insert(new BoxGeometry().add(new Transform({ position: [1, 0, 0, 1] })).add(new Parent(arm)));
 * ```
 */
export class Parent extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;

    constructor(entity: EntityId) {
        super();
        this.data = { entity };
    }

    /** Entidade pai. */
    get entity(): EntityId {
        return this.data.entity as EntityId;
    }

    /** Sem dado de GPU: a hierarquia é mantida pelo estágio de transformação. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
