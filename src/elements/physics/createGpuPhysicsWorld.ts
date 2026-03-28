/**
 * createGpuPhysicsWorld — factory para criação do mundo de física GPU-only.
 *
 * Cria e conecta internamente: GpuComputePassRegistry, GpuPipelineEventBus,
 * PhysicsResourceLoader, LCPComputePass (RigidBody) e SoftBodyXPBDComputePass.
 *
 * Uso típico:
 * ```typescript
 * const world = createGpuPhysicsWorld({
 *     substeps: 4,
 *     rigidBody: { iterations: 10 },
 *     softBody:  { iterations: 15, restitution: 0.05 },
 * });
 * world.addForce(new ConstantForce('gravity', new Float32Array([0, -9.81, 0])));
 *
 * const renderer = new WebGPURenderer(world);
 * await renderer.initialize(canvas);
 * ```
 */

import type { Force }              from '../../scene/systems/forces/Force';
import type { PhysicsSceneConfig } from '../../scene/systems/PhysicsSceneConfig';
import { GpuComputePassRegistry }  from '../../scene/systems/gpu/GpuComputePassRegistry';
import { DefaultGpuPipelineEventBus } from '../../scene/systems/gpu/DefaultGpuPipelineEventBus';
import { PhysicsResourceLoader }   from '../../scene/rendering/PhysicsResourceLoader';
import { GpuPhysicsOrchestrator }  from '../../scene/rendering/GpuPhysicsOrchestrator';
import { LCPComputePass as RigidBodyLCPComputePass } from './rigidbody/LCPComputePass';
import { SoftBodyXPBDComputePass } from './softbody/XPBDComputePass';

export function createGpuPhysicsWorld(config: PhysicsSceneConfig = {}): GpuPhysicsOrchestrator {
    const substeps     = config.substeps ?? 4;
    const globalForces = new Map<string, Force>();
    const getSubsteps  = () => substeps;

    const eventBus  = new DefaultGpuPipelineEventBus();
    const registry  = new GpuComputePassRegistry();
    const resLoader = new PhysicsResourceLoader<GpuPhysicsOrchestrator>(eventBus);

    // RigidBody pass — LCP/PGS (velocity-space, Catto 2005)
    const rb = config.rigidBody ?? {};
    registry.register(new RigidBodyLCPComputePass(
        globalForces,
        getSubsteps,
        rb.iterations ?? 15,
        rb.profilerLogInterval ?? 60,
        config.rigidBody,
        eventBus,
    ));

    // SoftBody pass — registrado apenas se config.softBody for fornecido
    if (config.softBody) {
        const sb = config.softBody;
        registry.register(new SoftBodyXPBDComputePass(
            globalForces,
            getSubsteps,
            sb.restitution ?? 0.05,
            sb.iterations  ?? 15,
            sb.profilerLogInterval ?? 60,
        ));
    }

    return new GpuPhysicsOrchestrator(config, registry, eventBus, resLoader, globalForces);
}
