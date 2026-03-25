import type { Renderer }         from '../interfaces/Renderer';
import type { Scene }            from '../../scene/core/Scene';
import type { Camera }           from '../../elements/cameras/Camera';
import type { RenderCommand }    from '../../scene/rendering/RenderQueue';
import type { EngineCore }       from '../../core/interfaces/EngineCore';
import { WebGPUEngineCore }      from '../../core/WebGPUEngineCore';
import { RenderExtractor }       from '../../scene/rendering/RenderExtractor';
import { ResourceLoader }        from '../../scene/rendering/ResourceLoader';
import type { SimulationWorld }  from '../../scene/systems/SimulationWorld';
import { PhysicsWorld }          from '../../elements/physics/PhysicsWorld';
import { CPURigidBodySolver }    from '../../elements/physics/solvers/CPURigidBodySolver';
import { GPUSpringMassSolver }   from '../../elements/physics/solvers/GPUSpringMassSolver';
import { ConstantForce }         from '../../elements/physics/forces/ConstantForce';
import { vec3 }                  from 'gl-matrix';
import { STD_PIPELINE_WGSL }          from '../shaders/StdPipelineShader';
import { THICK_WIREFRAME_WGSL, THICK_WIREFRAME_ID } from '../shaders/ThickWireframeShader';
import { Loggable }              from '../../core/debug/Loggable';
import { Logger }                from '../../core/debug/Logger';
import { LogCall }               from '../../core/debug/LogCall';
import { DebugMarker }           from '../../core/debug/DebugMarker';
import { LightType }             from '../../scene/lights/Light';

/**
 * O Renderizador Final WebGPU (Camada 4).
 * Orquestra o Carregador (C2->C1), o Extrator (C2->C4) e usa a Camada 1 para despachar Comandos.
 *
 * Layout de bind groups padrão (std_pipeline_hash):
 *   @group(0) — frame globals : viewProj matrix (64 bytes)
 *   @group(1) — per-object    : model matrix    (64 bytes, dynamic offset, stride 256 bytes)
 *   @group(2) — material      : color/roughness (criado em Material.allocateResource)
 */
@Loggable('WebGPURenderer')
export class WebGPURenderer implements Renderer {
    declare private readonly log: Logger;
    private engine:    EngineCore;
    private extractor: RenderExtractor;
    private loader:    ResourceLoader;
    private world:     SimulationWorld;

    private canvasWidth:  number = 800;
    private canvasHeight: number = 600;
    private clearColor = { r: 0.1, g: 0.1, b: 0.15, a: 1.0 };
    private lastTime:    number = 0;
    private sceneConnected: Scene | null = null;

    // ── Recursos persistentes de frame ─────────────────────────────────────
    private gpuResourcesReady: boolean = false;
    private depthView: GPUTextureView | null = null;

    /**
     * UBO de frame globals (group 0): viewProj + luzes + screen — 128 bytes.
     * Layout (32 floats):
     *   [0..15]  viewProj mat4x4f
     *   [16..19] ambientColor vec4f  (xyz=cor, w=intensidade)
     *   [20..23] dirDirection vec4f  (xyz=direção em direção à fonte, w=0)
     *   [24..27] dirColor vec4f      (xyz=cor, w=intensidade)
     *   [28..31] screen vec4f        (x=width, y=height em pixels)
     */
    private readonly frameUboId   = 'renderer_frame_ubo';
    private readonly frameUboData = new Float32Array(32);
    private frameBindGroup: GPUBindGroup | null = null;

    /** Registry de WGSL por shaderId — permite que pipelines usem shaders diferentes. */
    private readonly shaderRegistry = new Map<string, string>([
        ['std_pipeline_hash', STD_PIPELINE_WGSL],
        [THICK_WIREFRAME_ID,  THICK_WIREFRAME_WGSL],
    ]);

    /**
     * UBO dinâmico de modelo (group 1).
     * Cada slot ocupa 256 bytes (64 de dados mat4, 192 de padding para alinhamento).
     * O dynamic offset por draw é: slotIndex × 256.
     */
    private readonly objectUboId = 'renderer_object_dyn_ubo';
    private objectBindGroup: GPUBindGroup | null = null;
    private objectUboData:   Float32Array | null = null;

    private readonly MAX_OBJECTS        = 2048;
    /** Floats por slot (256 bytes / 4 bytes = 64 floats; 16 usados como mat4, 48 de padding). */
    private readonly OBJECT_SLOT_FLOATS = 64;

    /** Cache de GPURenderPipeline por pipelineHashId. */
    private pipelineCache = new Map<string, GPURenderPipeline>();

    /**
     * Layout do @group(3) — geo storage para vertex pulling.
     * Alocado em initGPUResources; compartilhado por todos os objetos vertex pulling.
     */
    private geoStorageLayout: GPUBindGroupLayout | null = null;

    /**
     * Cache de GPUBindGroup de geo storage, chaveado por `${vboId}|${iboId}`.
     * Cada geometria recebe um bind group próprio com seu VBO, IBO e GeoInfo UBO.
     */
    private geoStorageCache = new Map<string, GPUBindGroup>();

    constructor(world?: SimulationWorld) {
        this.engine    = WebGPUEngineCore.getInstance();
        this.extractor = new RenderExtractor();
        this.loader    = new ResourceLoader();

        if (world) {
            this.world = world;
        } else {
            const defaultWorld = new PhysicsWorld();
            defaultWorld.setSolver('RigidBody', new CPURigidBodySolver());
            defaultWorld.setSolver('SoftBody',  new GPUSpringMassSolver(this.engine.compute));
            defaultWorld.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
            this.world = defaultWorld;
        }
    }

    /**
     * Inicializa o backend WebGPU e adquire o device da GPU.
     * Deve ser chamado uma vez antes de render().
     * Toda a Camada 1 (device, queue, context) é gerenciada aqui — invisível ao usuário.
     */
    @LogCall('info', 'Renderer pronto — canvas {0.width}×{0.height} em {duration}')
    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        await this.engine.initialize(canvas);
        this.setSize(canvas.width, canvas.height);
    }

    public setSize(width: number, height: number): void {
        this.canvasWidth  = width;
        this.canvasHeight = height;
        if (this.gpuResourcesReady) this.recreateDepthTexture();
    }

    public setClearColor(r: number, g: number, b: number, a: number): void {
        this.clearColor = { r, g, b, a };
    }

    // ── Ciclo Principal ─────────────────────────────────────────────────────

    public async render(scene: Scene, camera: Camera): Promise<void> {
        // [PASSO 0] INICIALIZAR RECURSOS GPU PERSISTENTES (executa uma vez, após initialize())
        if (!this.gpuResourcesReady) this.initGPUResources();

        // [PASSO 1] CONECTAR MUNDO À CENA (event-driven, uma vez por cena)
        if (this.sceneConnected !== scene) {
            if (this.sceneConnected) this.world.disconnectScene(this.sceneConnected);
            this.world.connectScene(scene);
            this.sceneConnected = scene;
        }

        // [PASSO 2] GARANTIR RECURSOS GPU DOS COMPONENTES (Geometry, Material, etc.)
        await this.loader.load(scene, this.engine.resources);

        // [PASSO 3] EXTRAIR CENA EM COMANDOS LINEARES (DoD)
        camera.updateMatrices();
        this.extractor.extract(scene, camera.position);

        // [PASSO 4] CRIAR PIPELINES FALTANTES (antes de abrir o render pass — pode ser async)
        await this.ensurePipelines();

        // [PASSO 5] GRAVAR COMMAND BUFFER
        const commandEncoder = this.engine.renderPasses.createCommandEncoder('FrameEncoder');
        DebugMarker.push(commandEncoder, 'Frame');

        // [PASSO 5a] FÍSICA
        DebugMarker.push(commandEncoder, 'Physics');
        const now = performance.now();
        const dt  = this.lastTime === 0 ? 0 : (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.world.step(scene, dt);
        DebugMarker.pop(commandEncoder);

        // [PASSO 5b] ATUALIZAR UNIFORM DE CÂMERA + LUZES (group 0)
        this.uploadFrameUbo(camera);

        // [PASSO 5c] PRÉ-CARREGAR TODAS AS MODEL MATRICES NO UBO DINÂMICO (group 1)
        const allCommands = this.collectAllCommands();
        this.uploadObjectMatrices(allCommands);

        // [PASSO 5c+] SINCRONIZAÇÃO GPU→UBO (apenas se há estágios GPU no mundo)
        // Sobrescreve os slots dos corpos GPU-simulados com a mat4 calculada pelo kernel.
        // A barreira entre compute e render pass é implícita (mesmo encoder, passes sequenciais).
        if (this.world.encodeSyncPasses) {
            const objectBufNative = this.engine.resources.buffers.getBuffer(this.objectUboId)?.native;
            if (objectBufNative) {
                const entityIdToSlot = this.buildEntityIdToSlot(allCommands);
                this.world.encodeSyncPasses(commandEncoder, entityIdToSlot, objectBufNative);
            }
        }

        // [PASSO 5d] RENDER PASS
        DebugMarker.push(commandEncoder, 'ForwardPass');
        const textureView = this.engine.getCurrentCanvasTextureView();
        const passEncoder = this.engine.renderPasses.beginRenderPass(
            commandEncoder, textureView, this.depthView!, this.clearColor, 'MainForwardPass',
        );

        this.drawCommands(passEncoder, allCommands);

        passEncoder.end();
        DebugMarker.pop(commandEncoder);

        DebugMarker.pop(commandEncoder); // Frame
        this.engine.renderPasses.submit([commandEncoder]);

        this.log.debug(`Frame — draws:${allCommands.length} dt:${(dt * 1000).toFixed(1)}ms`);
    }

    // ── Frame UBO ────────────────────────────────────────────────────────────

    /**
     * Empacota viewProj + luzes extraídas no frame UBO (group 0).
     * Defaults quando a cena não tem luzes declaradas:
     *   ambient   : [0.15, 0.15, 0.15] intensity 1.0
     *   directional: direção [0.5, -1, -0.3] normalized, branca, intensity 1.0
     */
    private uploadFrameUbo(camera: Camera): void {
        const d = this.frameUboData;

        // [0..15] viewProj
        d.set(camera.viewProjectionMatrix as Float32Array, 0);

        // Defaults
        let ambR = 0.15, ambG = 0.15, ambB = 0.15, ambI = 1.0;
        const defLen = Math.sqrt(0.5 * 0.5 + 1.0 * 1.0 + 0.3 * 0.3);
        let dirX = 0.5 / defLen, dirY = -1.0 / defLen, dirZ = -0.3 / defLen;
        let dirR = 1.0, dirG = 1.0, dirB = 1.0, dirI = 1.0;

        for (const light of this.extractor.lights) {
            if (light.type === LightType.Ambient) {
                ambR = light.color[0]!; ambG = light.color[1]!; ambB = light.color[2]!;
                ambI = light.intensity;
            } else if (light.type === LightType.Directional) {
                // Inverte: light.direction = sentido que a luz PARTE; shader precisa sentido PARA a fonte
                dirX = -light.direction[0]!;
                dirY = -light.direction[1]!;
                dirZ = -light.direction[2]!;
                const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
                dirX /= len; dirY /= len; dirZ /= len;
                dirR = light.color[0]!; dirG = light.color[1]!; dirB = light.color[2]!;
                dirI = light.intensity;
            }
        }

        // [16..19] ambientColor (xyz=cor, w=intensidade)
        d[16] = ambR; d[17] = ambG; d[18] = ambB; d[19] = ambI;
        // [20..23] dirDirection (xyz=direção EM DIREÇÃO à fonte, w=0)
        d[20] = dirX; d[21] = dirY; d[22] = dirZ; d[23] = 0;
        // [24..27] dirColor (xyz=cor, w=intensidade)
        d[24] = dirR; d[25] = dirG; d[26] = dirB; d[27] = dirI;
        // [28..31] screen (x=width, y=height em pixels)
        d[28] = this.canvasWidth; d[29] = this.canvasHeight; d[30] = 0; d[31] = 0;

        this.engine.resources.buffers.writeBuffer(this.frameUboId, d);
    }

    // ── Recursos GPU internos ────────────────────────────────────────────────

    private initGPUResources(): void {
        this.gpuResourcesReady = true;
        const rm  = this.engine.resources;

        // UBO frame globals (group 0) — 128 bytes = mat4x4f + 4×vec4f (viewProj + luzes + screen)
        rm.buffers.createUniformBuffer(this.frameUboId, 128);

        // UBO dinâmico de modelo (group 1) — MAX_OBJECTS × 256 bytes.
        // Inclui STORAGE para que rb_sync_transform possa escrever nele via compute.
        const objectUboBytes = this.MAX_OBJECTS * this.OBJECT_SLOT_FLOATS * 4;
        rm.buffers.createUniformBuffer(
            this.objectUboId, objectUboBytes,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        );
        this.objectUboData = new Float32Array(this.MAX_OBJECTS * this.OBJECT_SLOT_FLOATS);

        // Layouts explícitos dos bind groups globais
        rm.bindings.getLayout('renderer_frame_layout', [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ]);
        rm.bindings.getLayout('renderer_object_layout', [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 },
            },
        ]);

        // Bind group 0 — câmera (offset fixo, sem dynamic offset)
        const frameBuf = rm.buffers.getBuffer(this.frameUboId)!;
        this.frameBindGroup = rm.bindings.getBindGroup(
            'renderer_frame_bg', 'renderer_frame_layout',
            [{ binding: 0, resource: { buffer: frameBuf.native } }],
        ).native;

        // Bind group 1 — modelo dinâmico (size = 64 bytes = 1 mat4, offset variável)
        const objectBuf = rm.buffers.getBuffer(this.objectUboId)!;
        this.objectBindGroup = rm.bindings.getBindGroup(
            'renderer_object_bg', 'renderer_object_layout',
            [{ binding: 0, resource: { buffer: objectBuf.native, size: 64 } }],
        ).native;

        // Layout do @group(3) — posições e arestas explícitas de wireframe
        this.geoStorageLayout = rm.bindings.getLayout('renderer_geo_storage_layout', [
            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // wfPos
            { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // wfEdges
        ]);

        this.recreateDepthTexture();
    }

    private recreateDepthTexture(): void {
        this.engine.resources.textures.destroyTexture('renderer_depth_texture');
        const tex = this.engine.resources.textures.createDepthTexture(
            'renderer_depth_texture', this.canvasWidth, this.canvasHeight,
        );
        this.depthView = tex.native.createView();
    }

    // ── Pipelines ───────────────────────────────────────────────────────────

    private async ensurePipelines(): Promise<void> {
        const needed = new Map<string, RenderCommand>();

        const collect = (cmd: RenderCommand) => {
            if (!this.pipelineCache.has(cmd.pipelineHashId) && !needed.has(cmd.pipelineHashId)) {
                needed.set(cmd.pipelineHashId, cmd);
            }
        };

        for (const cmds of this.extractor.opaqueGroups.values()) {
            for (const cmd of cmds) collect(cmd);
        }
        for (const cmd of this.extractor.transparentList) collect(cmd);

        await Promise.all([...needed.values()].map(cmd => this.createPipeline(cmd)));
    }

    @LogCall('info', 'Pipeline criada — {0.pipelineHashId} em {duration}')
    private async createPipeline(cmd: RenderCommand): Promise<void> {
        // Comandos sem vertexLayout (partículas) não usam o pipeline padrão ainda
        if (!cmd.vertexLayout) return;

        const rm = this.engine.resources;

        const frameLayout  = rm.bindings.getLayout('renderer_frame_layout',  []);
        const objectLayout = rm.bindings.getLayout('renderer_object_layout', []);
        const matLayout    = rm.bindings.getLayout(cmd.materialLayoutId,     []);

        const bindGroupLayouts = cmd.useVertexPulling
            ? [frameLayout, objectLayout, matLayout, this.geoStorageLayout!]
            : [frameLayout, objectLayout, matLayout];

        const pipelineLayout = this.engine.pipelines.createPipelineLayout(
            `pl_${cmd.pipelineHashId}`,
            bindGroupLayouts,
        );

        const topology = cmd.topology ?? 'triangle-list';
        const wgsl = this.shaderRegistry.get(cmd.materialLayoutId) ?? STD_PIPELINE_WGSL;

        // Pipeline transparente: desabilita escrita no depth buffer e ativa alpha blending.
        // Pipeline vertex pulling: não declara vertex buffers (o shader lê via storage).
        const transparent = cmd.pipelineHashId.endsWith('|t');

        const pipeline = await this.engine.pipelines.createRenderPipeline(
            cmd.pipelineHashId,
            wgsl,
            {
                layout:    pipelineLayout,
                primitive: { topology, cullMode: 'none' },
                depthStencil: {
                    format:            'depth24plus',
                    depthWriteEnabled: !transparent,
                    depthCompare:      'less',
                },
                vertexEntryPoint:   'vs_main',
                fragmentEntryPoint: 'fs_main',
                ...(cmd.useVertexPulling ? {} : { vertexBuffers: [cmd.vertexLayout.getGPUVertexBufferLayout()] }),
                ...(transparent ? {
                    fragmentTargets: [{
                        format: this.engine.canvasFormat,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }],
                } : {}),
            },
        );

        this.pipelineCache.set(cmd.pipelineHashId, pipeline);
    }

    // ── Draw ────────────────────────────────────────────────────────────────

    /**
     * Constrói um mapa de entityId → slot no UBO dinâmico (índice em allCommands).
     * Usado por encodeSyncPasses para informar ao pipeline GPU em qual slot escrever.
     */
    private buildEntityIdToSlot(commands: RenderCommand[]): Map<number, number> {
        const map = new Map<number, number>();
        for (let i = 0; i < commands.length && i < this.MAX_OBJECTS; i++) {
            const id = commands[i]!.entityId;
            if (id !== undefined) map.set(id, i);
        }
        return map;
    }

    /** Lineariza opaque + transparent em uma única lista indexável. */
    private collectAllCommands(): RenderCommand[] {
        const all: RenderCommand[] = [];
        for (const cmds of this.extractor.opaqueGroups.values()) {
            for (const cmd of cmds) all.push(cmd);
        }
        for (const cmd of this.extractor.transparentList) all.push(cmd);
        return all;
    }

    /**
     * Grava todas as model matrices no UBO dinâmico em uma única chamada writeBuffer,
     * cada uma no seu slot de 256 bytes (floatOffset = slotIndex × 64).
     */
    private uploadObjectMatrices(commands: RenderCommand[]): void {
        const data  = this.objectUboData!;
        const count = Math.min(commands.length, this.MAX_OBJECTS);
        for (let i = 0; i < count; i++) {
            data.set(commands[i]!.worldMatrix, i * this.OBJECT_SLOT_FLOATS);
        }
        if (count > 0) {
            this.engine.resources.buffers.writeBuffer(
                this.objectUboId,
                data.subarray(0, count * this.OBJECT_SLOT_FLOATS),
            );
        }
    }

    private drawCommands(pass: GPURenderPassEncoder, commands: RenderCommand[]): void {
        const rm = this.engine.resources;
        let currentPipelineId = '';

        for (let i = 0; i < commands.length && i < this.MAX_OBJECTS; i++) {
            const cmd = commands[i]!;

            // Trocar pipeline apenas quando necessário
            if (cmd.pipelineHashId !== currentPipelineId) {
                const pipeline = this.pipelineCache.get(cmd.pipelineHashId);
                if (!pipeline) continue;
                pass.setPipeline(pipeline);
                pass.setBindGroup(0, this.frameBindGroup!);
                currentPipelineId = cmd.pipelineHashId;
            }

            // Group 1: model matrix com dynamic offset (stride = OBJECT_SLOT_FLOATS × 4 bytes)
            pass.setBindGroup(1, this.objectBindGroup!, [i * this.OBJECT_SLOT_FLOATS * 4]);

            // Group 2: material
            if (cmd.materialBindGroupIds.length > 0) {
                const matBg = rm.bindings.getBindGroup(
                    cmd.materialBindGroupIds[0]!,
                    cmd.materialLayoutId,
                    [],  // já existe em cache; entries são ignoradas
                );
                pass.setBindGroup(2, matBg.native);
            }

            if (cmd.useVertexPulling) {
                // Vertex pulling: @group(3) com VBO, IBO e GeoInfo como storage/uniform buffers.
                // Nenhum vertex buffer é vinculado — o shader lê tudo via @builtin(vertex_index).
                const geoBg = this.getOrCreateGeoStorageBg(cmd);
                if (!geoBg) continue;
                pass.setBindGroup(3, geoBg);

                // 18 vértices por triângulo = indexCount × 6
                pass.draw(cmd.vertexCount * 6, cmd.instanceCount);
                continue;
            }

            // Caminho padrão: vertex buffer + optional index buffer
            const vbo = rm.buffers.getBuffer(cmd.geometryId);
            if (!vbo) continue;
            pass.setVertexBuffer(0, vbo.native);

            if (cmd.indexBufferId) {
                const ibo = rm.buffers.getBuffer(cmd.indexBufferId);
                if (ibo) {
                    pass.setIndexBuffer(ibo.native, 'uint32');
                    pass.drawIndexed(cmd.vertexCount, cmd.instanceCount);
                    continue;
                }
            }

            pass.draw(cmd.vertexCount, cmd.instanceCount);
        }
    }

    /**
     * Retorna (criando se necessário) o GPUBindGroup de @group(3) para uma geometria.
     * Cria também o GeoInfo UBO (stride e posOffset em floats) se ainda não existir.
     */
    private getOrCreateGeoStorageBg(cmd: RenderCommand): GPUBindGroup | null {
        const cacheKey = `${cmd.wireframePositionsBufferId ?? ''}|${cmd.wireframeEdgesBufferId ?? ''}`;
        const cached = this.geoStorageCache.get(cacheKey);
        if (cached) return cached;

        const rm     = this.engine.resources;
        const wfPos  = cmd.wireframePositionsBufferId ? rm.buffers.getBuffer(cmd.wireframePositionsBufferId) : undefined;
        const wfEdge = cmd.wireframeEdgesBufferId     ? rm.buffers.getBuffer(cmd.wireframeEdgesBufferId)     : undefined;
        if (!wfPos || !wfEdge) return null;

        const bg = rm.bindings.getBindGroup(
            `geo_storage_bg_${cacheKey}`,
            'renderer_geo_storage_layout',
            [
                { binding: 0, resource: { buffer: wfPos.native  } },
                { binding: 1, resource: { buffer: wfEdge.native } },
            ],
        );

        this.geoStorageCache.set(cacheKey, bg.native);
        return bg.native;
    }
}
