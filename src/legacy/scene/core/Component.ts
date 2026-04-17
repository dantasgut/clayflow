import type { Entity } from './Entity';
import type { Resource } from './Resource';
import { ResourceType } from './ResourceType';

/**
 * Interface base para qualquer Componente Visual/Lógico estrito
 * ancorado a uma Entidade.
 */
export interface Component extends Resource {
    readonly layer: ResourceType.VISUAL_COMPONENT;

    onAttach?(entity: Entity): void;
    onDetach?(entity: Entity): void;
}
