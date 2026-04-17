/**
 * Conjunto tipado de IDs dos buffers globais do subsistema RigidBody GPU.
 *
 * Análogo ao `SoftBodyGpuBufferSet` (por instância), mas representa o conjunto
 * compartilhado por TODOS os RigidBodies ativos — uma abstração de nível de Sistema (ECS).
 *
 * Armazenado como singleton `RIGID_BODY_GLOBAL_BUFFER_SET` — não há instância por corpo.
 */
export interface RigidBodyGlobalBufferSet {
    /** Storage buffer `RigidBodyState[]` — todos os corpos rígidos ativos. */
    bodiesId:    string;
    /** Uniform buffer `RBSimParams` — parâmetros de simulação por frame. */
    simParamsId: string;
    /** Storage buffer `RBContact[]` — slots de contato para narrowphase. */
    contactsId:  string;
    /** Storage buffer `u32[]` — mapeamento gpuRbIndex → slot no UBO do renderer. */
    toUboMapId:  string;
}

/** Instância singleton dos IDs de buffer globais do subsistema RigidBody. */
export const RIGID_BODY_GLOBAL_BUFFER_SET: RigidBodyGlobalBufferSet = {
    bodiesId:    'gpu_rb_bodies',
    simParamsId: 'gpu_rb_simparams',
    contactsId:  'gpu_rb_contacts',
    toUboMapId:  'gpu_rb_to_ubo_map',
};
