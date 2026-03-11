import { WebGPUEngineCore } from './core/WebGPUEngineCore';
import { WebGPURenderer } from './presentation/renderers/WebGPURenderer';
import { Scene } from './scene/core/Scene';
import { Entity } from './scene/core/Entity';
import { Camera } from './scene/cameras/Camera';
import { vec3 } from 'gl-matrix';

async function init() {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;

    // Resize canvas to match window
    const resizeCanvas = () => {
        canvas.width = window.innerWidth * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 2. Setup Básico da Camada 2 (Data-Oriented Scene)
    const scene = new Scene();

    const cameraEntity = new Entity();
    const camera = new Camera();
    cameraEntity.addComponent(camera);
    vec3.set(cameraEntity.transform.position, 0, 0, 5);

    // 3. O Maestro da Camada 4
    const renderer = new WebGPURenderer();
    renderer.setSize(canvas.width, canvas.height);
    renderer.setClearColor(0.2, 0.2, 0.25, 1.0);

    console.log("WebGPU Architecture Initialized Successfully! Starting Game Loop...");

    // 4. O Game Loop Reativo
    const tick = async () => {
        // Toda a magia de sincronização de buffers (Loader) e 
        // extração otimizada OCP (RenderExtractor) e encodings acontece aqui dentro
        await renderer.render(scene, camera);

        requestAnimationFrame(tick);
    };

    tick();
}

init().catch(console.error);
