// ── Payloads ──────────────────────────────────────────────────────────────────

export interface PhysicsBodiesChangedPayload {
    /** Número de corpos afetados (adicionados + removidos + atualizados). */
    changedCount: number;
}

export interface PhysicsCollidersChangedPayload {
    changedCount: number;
}


export interface PhysicsFrameSubmittedPayload {
    bodyCount:  number;
    submitTime: number; // performance.now()
}

export interface PhysicsTransformsReadyPayload {
    pipelineId: string;
    transforms: ReadonlyArray<{
        gpuRbIndex: number;
        position:   readonly [number, number, number];
        rotation:   readonly [number, number, number, number];
    }>;
}

export interface PhysicsRbReallocatedPayload {
    /** Número de RigidBodies no novo buffer global. */
    bodyCount:     number;
    /** Número de colliders na cena no momento da alocação. */
    colliderCount: number;
}

// ── Mapa de eventos ───────────────────────────────────────────────────────────

export interface GpuPipelineEventMap {
    'physics:bodies:changed':     PhysicsBodiesChangedPayload;
    'physics:colliders:changed':  PhysicsCollidersChangedPayload;
'physics:frame:submitted':    PhysicsFrameSubmittedPayload;
    'physics:transforms:ready':   PhysicsTransformsReadyPayload;
    'physics:rb:reallocated':     PhysicsRbReallocatedPayload;
}

export type GpuPipelineEventType = keyof GpuPipelineEventMap;

// ── Interface do EventBus ─────────────────────────────────────────────────────

/**
 * Barramento de eventos tipado para coordenação de stages do pipeline GPU.
 * Camada 2 — sem dependência de WebGPU.
 *
 * Eventos nomeados por domínio de stage JS (physics:*), nunca por shader (rb_*).
 * Handlers são síncronos — sem microtasks adicionais no caminho crítico do frame.
 */
export interface GpuPipelineEventBus {
    on<K extends GpuPipelineEventType>(
        type:    K,
        handler: (payload: GpuPipelineEventMap[K]) => void,
    ): () => void;  // retorna unsubscribe

    off<K extends GpuPipelineEventType>(
        type:    K,
        handler: (payload: GpuPipelineEventMap[K]) => void,
    ): void;

    emit<K extends GpuPipelineEventType>(
        type:    K,
        payload: GpuPipelineEventMap[K],
    ): void;
}
