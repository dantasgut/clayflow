/**
 * Série temporal de um descritor (spec 037, canal temporal): a C2 mantém `depth` fatias do mesmo descritor — a atual
 * (atraso 0) e as anteriores —, gira o anel quando o produtor grava, carimba cada fatia com o tempo do quadro e invalida
 * a série nos eventos que quebram a continuidade. Vale para texturas (`texture`, `storage-texture`) e pools
 * (`storage: 'pool'` com `upload: 'never'`). Contrato: `specs/037-padronizacao-matematica/contracts/temporal-channel.md`.
 */
export interface HistoryShape {
    /** Fatias no anel (inteiro ≥ 2): a atual e as `depth − 1` anteriores. */
    readonly depth: number;
    /**
     * Precisão de uma textura declarada num formato float de 16 bits: `'full'` troca pelo de 32 bits com os mesmos
     * canais. Com `filtered` e sem a feature `float32-filterable`, fica em 16 bits com um aviso. Default `'half'`.
     */
    readonly precision?: 'half' | 'full';
    /** A série é lida com amostrador filtrante (o recuo de `'full'` depende disso). Default `false`. */
    readonly filtered?: boolean;
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
