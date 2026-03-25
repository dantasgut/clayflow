import { WebGPURenderer }    from './presentation/renderers/WebGPURenderer';
import { Scene }             from './scene/core/Scene';
import { PerspectiveCamera } from './elements/cameras/PerspectiveCamera';

async function init() {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;

    // Dimensiona o canvas antes de inicializar o renderer
    canvas.width  = window.innerWidth  * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;

    const scene  = new Scene();
    const camera = new PerspectiveCamera(Math.PI / 4, canvas.width / canvas.height, 0.1, 1000);
    camera.position[2] = 5;
    scene.add(camera);

    // A camada 1 (device WebGPU) é inicializada aqui — invisível ao usuário da biblioteca
    const renderer = new WebGPURenderer();
    await renderer.initialize(canvas);
    renderer.setClearColor(0.2, 0.2, 0.25, 1.0);

    // Agora que o renderer existe, o resize atualiza canvas E depth texture juntos
    window.addEventListener('resize', () => {
        canvas.width  = window.innerWidth  * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
        renderer.setSize(canvas.width, canvas.height);
    });

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
