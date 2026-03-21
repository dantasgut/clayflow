/**
 * Exemplo 03 — Sistema de partículas
 *
 * Demonstra:
 * - CPUParticleEmitter com ConeEmitterShape (fogueira / fonte)
 * - GPUParticleEmitter para grandes quantidades (fumaça densa)
 * - Emissores registrados automaticamente via PhysicsWorld.connectScene
 */

import { Scene }                from '../scene/core/Scene';
import { Entity }               from '../scene/core/Entity';
import { Transform }            from '../scene/math/Transform';
import { WebGPURenderer }       from '../presentation/renderers/WebGPURenderer';
import { CPUParticleEmitter }   from '../elements/particles/CPUParticleEmitter';
import { GPUParticleEmitter }   from '../elements/particles/GPUParticleEmitter';
import { ConeEmitterShape }     from '../elements/particles/shapes/ConeEmitterShape';
import { SphereEmitterShape }   from '../elements/particles/shapes/SphereEmitterShape';

async function main(canvas: HTMLCanvasElement): Promise<void> {
    const scene    = new Scene();
    const renderer = new WebGPURenderer();

    // Fogueira — cone estreito, partículas sobem rapidamente (CPU, ~500 partículas)
    const fire = new Entity();
    const fireTransform = new Transform();
    fireTransform.position[1] = 0.1;
    fire.add(fireTransform);
    fire.add(new CPUParticleEmitter({
        maxParticles:  500,
        emissionRate:  120,
        maxLife:       1.5,
        initialSpeed:  2.5,
        gravity:       [0, 1.0, 0],   // "gravidade" invertida — chamas sobem
        shape:         new ConeEmitterShape(Math.PI / 12, 0.05),
    }));
    scene.add(fire);

    // Fumaça — esfera larga, dispersa (CPU, ~300 partículas)
    const smoke = new Entity();
    const smokeTransform = new Transform();
    smokeTransform.position[1] = 1.5;
    smoke.add(smokeTransform);
    smoke.add(new CPUParticleEmitter({
        maxParticles:  300,
        emissionRate:  40,
        maxLife:       4.0,
        initialSpeed:  0.4,
        gravity:       [0, 0.2, 0],
        shape:         new SphereEmitterShape(0.1),
    }));
    scene.add(smoke);

    // Explosão de partículas — GPU para grande volume (requer engine.compute e device)
    // const explosion = new Entity();
    // explosion.add(new GPUParticleEmitter(engine.compute, device, {
    //     maxParticles: 50_000,
    //     emissionRate: 5_000,
    //     maxLife:      2.0,
    //     initialSpeed: 8.0,
    //     shape:        new SphereEmitterShape(0.01),
    // }));
    // scene.add(explosion);

    renderer.setSize(canvas.width, canvas.height);

    // const camera = new Camera(...)
    // requestAnimationFrame(() => renderer.render(scene, camera));
}

export { main };
