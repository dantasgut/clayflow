import type { PresentationContext, PresentationSurface } from '../../contracts/PlatformAdapter';

/**
 * Superfície de apresentação sobre uma textura (spec 038): o quadro final vai para uma textura do tamanho pedido, sem
 * tela — para gravar vídeo, testar ou pré-calcular em qualquer ambiente com WebGPU (o navegador sem canvas, o Deno sem
 * janela). O contexto emula o do canvas: `configure` cria a textura no device com o formato e os usos pedidos (mais o
 * de alvo de desenho), `getCurrentTexture` a devolve e a leitura do quadro (`readCanvas`) a copia como faria com o
 * canvas. `resize` muda o tamanho; a textura nova sai na próxima configuração.
 */
export class TextureSurface implements PresentationSurface {
    private w: number;
    private h: number;
    private texture: GPUTexture | null = null;
    private configuration: GPUCanvasConfiguration | null = null;
    readonly context: PresentationContext;

    constructor(width: number, height: number) {
        TextureSurface.check(width, height);
        this.w = width;
        this.h = height;
        this.context = {
            configure: (configuration) => {
                this.release();
                this.configuration = configuration;
                this.texture = configuration.device.createTexture({
                    label: 'TextureSurface',
                    size: { width: this.w, height: this.h },
                    format: configuration.format,
                    // RENDER_ATTACHMENT (0x10): o alvo do último passe, como a textura do canvas.
                    usage: (configuration.usage ?? 0) | 0x10,
                });
            },
            unconfigure: () => {
                this.release();
                this.configuration = null;
            },
            getCurrentTexture: () => {
                if (this.texture === null)
                    throw new Error('TextureSurface: configure antes de pedir a textura.');
                return this.texture;
            },
            getConfiguration: () => this.configuration,
        };
    }

    get width(): number {
        return this.w;
    }

    get height(): number {
        return this.h;
    }

    /** Muda o tamanho (pixels); a textura nova é criada na próxima configuração (`reconfigureCanvas`). */
    resize(width: number, height: number): void {
        TextureSurface.check(width, height);
        this.w = width;
        this.h = height;
    }

    private release(): void {
        this.texture?.destroy();
        this.texture = null;
    }

    private static check(width: number, height: number): void {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
            throw new RangeError(
                `TextureSurface: tamanho deve ser inteiro ≥ 1 (recebido ${width} × ${height}).`,
            );
    }
}
