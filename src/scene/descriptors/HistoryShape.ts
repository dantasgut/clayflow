/**
 * Série temporal de um descritor (spec 037, canal temporal): a C2 mantém `depth` fatias do mesmo descritor — a atual
 * (atraso 0) e as anteriores —, gira o anel quando o produtor grava, carimba cada fatia com o tempo do quadro e invalida
 * a série nos eventos que quebram a continuidade. Vale para texturas (`texture`, `storage-texture`) e pools
 * (`storage: 'pool'` com `upload: 'never'`). Contrato: `specs/037-padronizacao-matematica/contracts/temporal-channel.md`.
 */
export interface HistoryShape {
    /**
     * Fatias no anel (inteiro ≥ 2): a atual e as `depth − 1` anteriores. Na série por páginas (`pages`), 1: um alvo só.
     */
    readonly depth: number;
    /**
     * Série por páginas (spec 034, T060a; textura ou buffer de storage próprio): o alvo é um só e a continuidade é
     * guardada por página — a C2 mantém o carimbo de cada página (a época em que foi escrita, num buffer que o
     * produtor atualiza na GPU) e o relógio da série (a época, que sobe a cada invalidação). Página com carimbo de
     * outra época não vale. Para o cache que muda pouco a cada quadro (os atlas da sombra virtual e do campo dos
     * fluidos, ambos em buffer), sem carregar o que não mudou de uma fatia à outra.
     */
    readonly pages?: HistoryPages;
    /**
     * Precisão de uma textura declarada num formato float de 16 bits: `'full'` troca pelo de 32 bits com os mesmos
     * canais. Com `filtered` e sem a feature `float32-filterable`, fica em 16 bits com um aviso. Default `'half'`.
     */
    readonly precision?: 'half' | 'full';
    /** A série é lida com amostrador filtrante (o recuo de `'full'` depende disso). Default `false`. */
    readonly filtered?: boolean;
}

/**
 * As páginas de uma série por páginas: numa textura, o lado de cada uma em texels (`tile`; a textura é dividida em
 * páginas inteiras — numa textura 3D, com o terceiro lado, também na profundidade); num buffer de storage próprio, os bytes de cada uma (`record`; o buffer é dividido em registros) e, opcional, os bytes
 * antes da primeira (`offset`; o começo do buffer fica fora das páginas — o buffer das consultas do campo dos fluidos, com
 * os voxels de cada bloco numa página no fim, T060f).
 */
export interface HistoryPages {
    readonly tile?: readonly [number, number] | readonly [number, number, number];
    readonly record?: number;
    readonly offset?: number;
}

/** Precisão de uma série temporal. */
export type HistoryPrecision = NonNullable<HistoryShape['precision']>;

/** O formato de 32 bits de um float de 16 bits (`undefined` para os demais). */
export function fullPrecisionOf(format: GPUTextureFormat): GPUTextureFormat | undefined {
    switch (format) {
        case 'r16float':
            return 'r32float';
        case 'rg16float':
            return 'rg32float';
        case 'rgba16float':
            return 'rgba32float';
        default:
            return undefined;
    }
}
