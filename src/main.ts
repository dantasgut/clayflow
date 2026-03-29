import { WebGPURenderer }           from './presentation/renderers/WebGPURenderer';
import { Scene }                    from './scene/core/Scene';
import { PerspectiveCamera }        from './elements/cameras/PerspectiveCamera';
import { createGpuPhysicsWorld }    from './elements/physics/createGpuPhysicsWorld';
import { ConstantForce }            from './elements/physics/forces/ConstantForce';
import { vec3 }                     from 'gl-matrix';

async function init(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    canvas.width  = window.innerWidth  * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;

    const world = createGpuPhysicsWorld({ substeps: 4 });
    world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));

    const renderer = new WebGPURenderer(world);
    await renderer.initialize(canvas);
    renderer.setClearColor(0.08, 0.08, 0.12, 1.0);

    window.addEventListener('resize', () => {
        canvas.width  = window.innerWidth  * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
        renderer.setSize(canvas.width, canvas.height);
    });

    const scene  = new Scene();
    const camera = new PerspectiveCamera(Math.PI / 4, canvas.width / canvas.height, 0.1, 500);
    camera.position[0] = 0;
    camera.position[1] = 1.5;
    camera.position[2] = 7;
    scene.add(camera);

    world.connectScene(scene);

    const tick = async (): Promise<void> => {
        await renderer.render(scene, camera);
        requestAnimationFrame(tick);
    };
    tick();
}

init().catch(console.error);
