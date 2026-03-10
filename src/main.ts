import { EngineCore } from './core/EngineCore';

async function init() {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;

    // Resize canvas to match window
    const resizeCanvas = () => {
        canvas.width = window.innerWidth * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 1. Inicializa a Arquitetura Suprema da Camada 1
    const engine = EngineCore.getInstance();
    await engine.initialize(canvas);

    // 2. Loop de Renderização Base usando os Wrappers Oficiais
    const commandEncoder = engine.renderPasses.createCommandEncoder("BaseFrame");
    const textureView = engine.getCurrentCanvasTextureView();
    
    const passEncoder = engine.renderPasses.beginRenderPass(
        commandEncoder,
        textureView,
        undefined, // Depth não configurado ainda
        { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
        "BackgroundColorPass"
    );
    
    passEncoder.end();
    engine.renderPasses.submit([commandEncoder]);

    console.log("WebGPU Layer 1 Core Initialized Successfully!");
}

init().catch(console.error);
