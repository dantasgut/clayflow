import type { Entity } from './Entity';

/**
 * Interface base para qualquer Componente (Geometry, Material, Transform) 
 * anexado a uma Entidade Entity. (Padrão ECS puro)
 */
export interface Component {
    readonly type: string;
    onAttach?(entity: Entity): void;
    onDetach?(entity: Entity): void;
}
