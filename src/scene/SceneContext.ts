import { GpuEngineCore } from '../core/gpu/GpuEngineCore';
import type { EngineCore } from '../core/contracts/index';
import { ConsumerResolverRegistry } from './consumers/ConsumerResolverRegistry';
import type { EventBus } from './events/EventBus';
import { DefaultEventBus } from './events/DefaultEventBus';
import type { FlowRegistry as FlowRegistryType } from './flows/FlowRegistry';
import { FlowRegistry } from './flows/FlowRegistry';
import { ExecutionSystem } from './systems/ExecutionSystem';
import { LayoutInferencer } from './systems/LayoutInferencer';
import { ResourceSystem } from './systems/ResourceSystem';
import { World } from './world/World';

/**
 * Bag de instâncias da Camada 2 (Sync). Cada `Application` opera sobre um
 * `SceneContext` — singletons em `scene/index.ts` continuam funcionando como
 * a instância default (compatibilidade), mas múltiplos contexts permitem
 * múltiplos `Application` no mesmo processo (multi-canvas, SSR, tests
 * paralelos isolados).
 */
export interface SceneContext {
    /** EngineCore — Camada 1, abstração GPU device. */
    readonly core: EngineCore;
    /** EventBus pub/sub tipado. */
    readonly events: EventBus;
    /** FlowRegistry — Flows registrados deste scene. */
    readonly flows: FlowRegistryType;
    /** World ECS-like — Resources indexados por schema/tag. */
    readonly world: World;
    /** ResourceSystem — alocação/upload/dispose de buffers GPU. */
    readonly resourceSystem: ResourceSystem;
    /** ExecutionSystem — orquestra dispatch de Flows por frame. */
    readonly executionSystem: ExecutionSystem;
    /** LayoutInferencer — deriva bindings GPU de WGSL parsed AST. */
    readonly layoutInferencer: LayoutInferencer;
    /** ConsumerResolverRegistry — resolve `consumes:[]` em PipelineDescriptors. */
    readonly consumers: ConsumerResolverRegistry;
    /**
     * Cancela inflight readbacks, libera GpuResourceStore, remove listeners
     * registrados. Após dispose, o context não pode ser reutilizado — crie
     * um novo via `createScene()`.
     */
    dispose(): void;
}

/**
 * Cria um SceneContext novo com instâncias frescas de Core/EventBus/World/etc.
 * Útil para apps multi-canvas ou tests isolados. Se você só precisa de uma
 * cena (caso comum), use os singletons exportados de `scene/index.ts`.
 */
export function createScene(): SceneContext {
    const core = new GpuEngineCore();
    const events = new DefaultEventBus();
    const flows = new FlowRegistry();
    const layoutInferencer = new LayoutInferencer();
    const consumers = new ConsumerResolverRegistry();
    const world = new World(events);
    const resourceSystem = new ResourceSystem(core, events, world);
    const executionSystem = new ExecutionSystem(core, events, flows);

    const unsubscribeDeviceLost = core.onDeviceLost((info) => {
        events.emit('deviceLost', { reason: info.reason, message: info.message });
    });

    let disposed = false;
    return {
        core,
        events,
        flows,
        world,
        resourceSystem,
        executionSystem,
        layoutInferencer,
        consumers,
        dispose() {
            if (disposed) return;
            disposed = true;
            unsubscribeDeviceLost();
            core.shutdown();
        },
    };
}
