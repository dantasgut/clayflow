/**
 * O contexto de apresentação (spec 038): o subconjunto do `GPUCanvasContext` que o motor usa — configurar no device,
 * desconfigurar, a textura do quadro corrente e a configuração aplicada. O do canvas do navegador e o da janela do Deno
 * o são de fato; a `TextureSurface` o emula sobre uma textura (desenho sem tela, lido de volta).
 */
export interface PresentationContext {
    configure(configuration: GPUCanvasConfiguration): void;
    unconfigure(): void;
    getCurrentTexture(): GPUTexture;
    getConfiguration?(): GPUCanvasConfiguration | null;
}

/**
 * Onde o quadro final é apresentado (spec 038): o tamanho atual em pixels, o contexto e, quando o ambiente pede, a
 * apresentação explícita depois de cada quadro (a janela do Deno; o canvas apresenta sozinho).
 */
export interface PresentationSurface {
    /** Largura atual (pixels do quadro). */
    readonly width: number;
    /** Altura atual (pixels do quadro). */
    readonly height: number;
    /** O contexto de apresentação. */
    readonly context: PresentationContext;
    /** Apresenta o quadro submetido (só os ambientes que não apresentam sozinhos). */
    present?(): void;
}

/**
 * Adaptador de plataforma (spec 038, padrão adapter): o que o motor pede ao ambiente — o adaptador da GPU, o formato
 * preferido da apresentação e o contexto de um alvo do ambiente (o canvas no navegador, a janela no Deno). O núcleo
 * nunca toca `navigator`, canvas nem `Deno`: cada ponto de entrada (`clayflow/web`, `clayflow/deno`) traz o seu.
 */
export interface PlatformAdapter<Target = unknown> {
    /** Nome do ambiente (diagnóstico e mensagens). */
    readonly name: string;
    /** O adaptador da GPU; `null` quando o ambiente não tem WebGPU ou nenhum adaptador atende. */
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    /** O formato preferido da apresentação no ambiente. */
    preferredFormat(): GPUTextureFormat;
    /** A superfície de apresentação de um alvo do ambiente. */
    getContext(target: Target): PresentationSurface;
}
