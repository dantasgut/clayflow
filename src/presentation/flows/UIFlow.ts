import type { EngineCore, Frame, RenderTarget } from '../../core/contracts/index';
import { Flow } from '../../scene/flows/Flow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { UiTree } from '../ui/UiTree';
import type { LoadedFont } from '../assets/FontLoader';
import { UiFlattener } from '../ui/flatten/UiFlattener';
import { UiTextLayout } from '../ui/flatten/UiTextLayout';
import { UiGpuPipeline } from '../ui/UiGpuPipeline';
import uiWGSL from './ui.wgsl?raw';

/**
 * UIFlow orquestra o pipeline de UI: mantém o `UiTree` (modelo), delega
 * flatten/text-layout para `UiFlattener`/`UiTextLayout`, e o resto (GPU) para
 * `UiGpuPipeline`. Esta classe é só coordenação: ≤ 100 linhas.
 */
export class UIFlow extends Flow {
    readonly type = 'UIFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'ui';

    private readonly tree = new UiTree();
    private readonly flattener = new UiFlattener();
    private readonly gpu: UiGpuPipeline;

    constructor(core: EngineCore, canvas: HTMLCanvasElement) {
        super();
        this.gpu = new UiGpuPipeline(core, canvas);
    }

    /** Acesso à árvore de UI — adicione panels/labels/buttons via `ui.add(...)`. */
    get ui(): UiTree {
        return this.tree;
    }

    /**
     * Define a fonte usada pelo UI (atlas + texture). Chamado uma vez
     * após carregar a fonte via `Application.assets.loadFont(url)`.
     */
    setFont(font: LoadedFont): this {
        this.gpu.setFont(font);
        this.flattener.setTextLayout(new UiTextLayout(font));
        return this;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_ui_quads',
                role: 'render',
                shaderSource: uiWGSL,
                entryPoints: ['vs_main', 'fs_main'],
                consumes: [],
            },
        ];
    }

    override isReady(): boolean {
        return this.tree.root.children.length > 0;
    }

    dispatch(frame: Frame): void {
        if (this.tree.root.children.length === 0) return;
        this.gpu.ensureGpuObjects();
        const quads = this.flattener.flatten(this.tree);
        this.gpu.upload(quads);
        if (!this.gpu.hasQuads) return;

        const target: RenderTarget = {
            colorAttachments: [
                {
                    view: frame.canvasView,
                    loadOp: 'load',
                    storeOp: 'store',
                },
            ],
        };
        this.gpu.draw(frame, target);
    }
}
