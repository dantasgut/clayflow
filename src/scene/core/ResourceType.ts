/**
 * Define o pilar de abstração (Layer Semântico) onde o objeto reside
 * para roteamento automático de O(1) na Entidade (ECS).
 */
export enum ResourceType {
    VISUAL_COMPONENT = 0, // Geometrias, Materiais, etc.
    PHYSICS_MECHANIC = 1, // RigidBodies, SoftBodies, Gravity, etc.
}
