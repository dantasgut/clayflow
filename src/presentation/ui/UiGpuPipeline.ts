import type {
    StorageBufferSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { BindingSource } from '../../scene/flows/FlowBinding';
import type { WorkContext, WorkPart } from '../../scene/flows/FlowWork';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { LoadedFont } from './font';
import type { UiQuadCpu } from './flatten/UiQuadCpu';
import { ScreenParamsSchema, UiQuadSchema } from '../flows/renderSchemas';
import { uiResources } from '../flows/shaders';

const MAX_QUADS = 1024;

/** Ids no Resource de trabalho do `UIFlow`. */
const SCREEN = 'ui_screen';
const QUADS = 'ui_quads';
const SAMPLER = 'ui_atlas_sampler';
const ATLAS = 'ui_atlas';

/**
 * Recursos de GPU da UI: parâmetros de tela, buffer de quads e sampler — descritores do Resource de trabalho do
 * `UIFlow` (spec 039: a C2 aloca, envia e libera), com o atlas da fonte (ou um texel branco enquanto não há fonte):
 * uma textura do trabalho cujo conteúdo (`data[ui_atlas]`) a C2 envia na alocação.
 * Ligados ao pipeline do `UIFlow` pelos recursos declarados (`uiResources`: `screen`, `quads`, `atlas`, `atlas_smp`);
 * o pipeline, o layout e o bind group são da C2.
 *
 * Uso:
 *   const gpu = new UiGpuPipeline(work);
 *   ctx.bind(gpu.sources());             // fontes privadas, com o trabalho na cena
 *   gpu.setFont(loadedFont);             // opcional — habilita texto; religar `atlas` (atlasChanged)
 *   gpu.upload(quads, size);             // antes da gravação
 */
export class UiGpuPipeline implements WorkPart {
    /** Tamanho do atlas (o texel branco até a fonte chegar). */
    private atlasSize: readonly [number, number] = [1, 1];
    private screenSize: readonly [number, number] = [0, 0];
    private count = 0;
    /** O atlas mudou desde o último `takeAtlasChange` (precisa ser religado). */
    private atlasDirty = false;

    constructor(private readonly work: WorkContext) {
        // O texel branco: o conteúdo do atlas até a fonte chegar.
        work.work.data[ATLAS] = new Uint8Array([255, 255, 255, 255]);
        work.work.use(this);
    }

    descriptors(): readonly GPUDescriptor[] {
        return [
            // Escritos da CPU só quando mudam (`writeNow`), cada um por si.
            { id: SCREEN, role: 'uniform', schema: ScreenParamsSchema, upload: 'never' },
            {
                id: QUADS,
                role: 'storage-ro',
                schema: UiQuadSchema,
                upload: 'never',
                count: MAX_QUADS,
            },
            {
                id: SAMPLER,
                role: 'sampler',
                samplerShape: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                },
            },
            {
                id: ATLAS,
                role: 'texture',
                textureShape: {
                    format: 'rgba8unorm',
                    width: this.atlasSize[0],
                    height: this.atlasSize[1],
                },
            },
        ];
    }

    private get atlasView(): TextureViewSpec {
        return this.work.resources.textureViewOf(this.work.work, ATLAS)!;
    }

    /** Fontes privadas do pipeline de UI, por recurso declarado (com o trabalho na cena). */
    sources(): ReadonlyMap<WgslResource, BindingSource> {
        const r = this.work.resources;
        const w = this.work.work;
        return new Map<WgslResource, BindingSource>([
            [uiResources.screen, r.bufferOf(w, SCREEN) as UniformBufferSpec],
            [uiResources.quads, r.bufferOf(w, QUADS) as StorageBufferSpec],
            [uiResources.atlas, this.atlasView],
            [uiResources.sampler, r.samplerOf(w, SAMPLER)!],
        ]);
    }

    /** O atlas mudou desde a última chamada (o chamador religa `atlas`)? */
    takeAtlasChange(): TextureViewSpec | undefined {
        if (!this.atlasDirty) return undefined;
        this.atlasDirty = false;
        return this.atlasView;
    }

    /**
     * Troca o atlas pelo da fonte (a C2 libera o anterior); o Flow religa `atlas` (`takeAtlasChange`) antes da próxima
     * gravação, então nenhum bind group gravado usa o atlas liberado.
     */
    setFont(font: LoadedFont): void {
        if (font.atlas === null) return;
        // O conteúdo primeiro: a C2 realoca a textura no tamanho da fonte e envia o atlas na alocação.
        this.work.work.data[ATLAS] = font.atlas;
        this.atlasSize = [font.atlasWidth, font.atlasHeight];
        this.work.work.refresh();
        this.atlasDirty = true;
    }

    /** Envia os quads (até `MAX_QUADS`) e, quando a tela muda, o tamanho dela. */
    upload(quads: readonly UiQuadCpu[], size: readonly [number, number]): void {
        if (size[0] !== this.screenSize[0] || size[1] !== this.screenSize[1]) {
            this.work.resources.writeNow(
                this.work.work,
                SCREEN,
                ScreenParamsSchema.pack({ size: [size[0], size[1]] }),
            );
            this.screenSize = size;
        }
        this.count = Math.min(quads.length, MAX_QUADS);
        if (this.count === 0) return;
        const buf = new ArrayBuffer(this.count * UiQuadSchema.stride);
        for (let i = 0; i < this.count; i++) {
            const q = quads[i]!;
            UiQuadSchema.packInto(buf, i * UiQuadSchema.stride, {
                rect: q.rect,
                color: q.color,
                uv: q.uv,
                textured: [q.textured, 0, 0, 0],
            });
        }
        this.work.resources.writeNow(this.work.work, QUADS, new Uint8Array(buf));
    }

    /** Quads enviados no último `upload`. */
    get quadCount(): number {
        return this.count;
    }
}
