import type { Renderer } from '../interfaces/Renderer';
import type { Scene } from '../../scene/core/Scene';
import type { Camera } from '../../scene/cameras/Camera';
import { WebGPUEngineCore } from '../../core/WebGPUEngineCore';
import { RenderExtractor } from '../../scene/rendering/RenderExtractor';
import { ResourceLoader } from '../../scene/rendering/ResourceLoader';
import { PhysicsSystem } from '../../scene/systems/PhysicsSystem';
import { PhysicsWorld } from '../../scene/systems/PhysicsWorld';
import { CPURigidBodySolver } from '../../scene/systems/solvers/CPURigidBodySolver';
import { GPUSpringMassSolver } from '../../scene/systems/solvers/GPUSpringMassSolver';
import type { Transform } from '../../scene/math/Transform';

/**
 * O Renderizador Final WebGPU (Camada 4).
 * Esta classe é o "Maestro" do Frame Loop.
 * Orquestra o Carregador (C2->C1), o Extrator (C2->C4) e usa a Camada 1 para despachar Comandos.
 */
export class WebGPURenderer implements Renderer {
    private engine: WebGPUEngineCore;
    private extractor: RenderExtractor;
    private loader: ResourceLoader;
    private physics: PhysicsSystem;

    private canvasWidth: number = 800;
    private canvasHeight: number = 600;
    private clearColor = { r: 0.1, g: 0.1, b: 0.15, a: 1.0 };
    private _lastTime: number = 0;

    constructor() {
        this.engine = WebGPUEngineCore.getInstance();
        this.extractor = new RenderExtractor();
        this.loader = new ResourceLoader();

        const world = new PhysicsWorld();
        world.setSolver('RigidBody', new CPURigidBodySolver(world.gravity));
        world.setSolver('SoftBody', new GPUSpringMassSolver(this.engine.compute));
        this.physics = new PhysicsSystem(world);
    }

    public setSize(width: number, height: number): void {
        this.canvasWidth = width;
        this.canvasHeight = height;
        // Todo: Notificar WebGPUContext para Resize do Depth Buffer se necessário
    }

    public setClearColor(r: number, g: number, b: number, a: number): void {
        this.clearColor = { r, g, b, a };
    }

    /**
     * O GRANDE CICLO DE FRAME (Game Loop).
     */
    public async render(scene: Scene, camera: Camera): Promise<void> {
        // [PASSO 1] GARANTIR RECURSOS (RESOURCE LOADER -> CAMADA 1)
        // O gerenciador de ciclo de vida assíncrono envia Uninitialized e Dirty para a GPU via Staging.
        await this.loader.load(scene, this.engine.resources);

        // [PASSO 2] ATUALIZAR MATEMÁTICA E EXTRAIR DADOS LINEARES (SCENE -> EXTRACTOR)
        if (camera.owner) {
            const transform = camera.owner.getComponent<Transform>('Transform');
            if (transform) {
                transform.updateWorldMatrix(false, false);
                this.extractor.extract(scene, transform.position);
            } else {
                this.extractor.extract(scene);
            }
        } else {
            this.extractor.extract(scene);
        }

        // [PASSO 3] GRAVAR WEB GPU COMMAND BUFFERS (EXTENSÃO DA CAMADA 4)
        // Encoder único compartilhado entre compute (física) e render pass (rasterização)
        const commandEncoder = this.engine.renderPasses.createCommandEncoder("FrameEncoder");

        // [PASSO 3a] FÍSICA — compute pass no mesmo encoder, antes do render pass
        const now = performance.now();
        const dt = this._lastTime === 0 ? 0 : (now - this._lastTime) / 1000;
        this._lastTime = now;
        this.physics.update(scene, commandEncoder, dt);

        const textureView = this.engine.getCurrentCanvasTextureView();

        // Inicializa a Tela
        const passEncoder = this.engine.renderPasses.beginRenderPass(
            commandEncoder,
            textureView,
            undefined, // Depth View ausente por enquanto
            this.clearColor,
            "MainForwardPass"
        );

        // --- Aqui viria o Forward Rasterization real consumindo a _extractor.opaqueGroups ---
        // Exemplo pseudo-mental do loop de C4 (ainda faltam abstrações):
        /*
        for (const [pipelineHash, commands] of this.extractor.opaqueGroups) {
            const pipeline = this.engine.pipelines.getPipeline(pipelineHash);
            passEncoder.setPipeline(pipeline);
            
            for (const cmd of commands) {
                const vbo = this.engine.resources.getBuffer(cmd.geometryId);
                passEncoder.setVertexBuffer(0, vbo);
                for (let i = 0; i < cmd.materialBindGroupIds.length; i++) {
                    const bg = this.engine.bindings.getBindGroup(cmd.materialBindGroupIds[i]);
                    passEncoder.setBindGroup(i, bg);
                }
                const drawCmdCount = Math.floor(cmd.vertexCount); 
                passEncoder.draw(drawCmdCount, cmd.instanceCount, 0, 0);
            }
        }
        */

        // Encerra a gravura na imagem e submete pra GPU
        passEncoder.end();
        this.engine.renderPasses.submit([commandEncoder]);
    }
}
