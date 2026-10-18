import { Entity } from '../../scene/contracts/Entity';
import type { ExtensionFunctionOptions } from '../../scene/contracts/ExtensionFunction';
import type { Resource } from '../../scene/contracts/Resource';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { DensityFunction } from '../extension/DensityFunction';
import { FOG_DENSITY, FOG_SHAPE, FogGridSchema } from './schemas';

/** Forma de um `FogVolume`: caixa (medidas inteiras) ou esfera (raio). */
export type FogShape =
    | { readonly box: readonly [number, number, number] }
    | { readonly sphere: number };

/** Densidade dada por uma grade de valores (relativos) sobre a caixa que contém o volume, x mais rápido. */
export interface FogDensityGrid {
    readonly size: readonly [number, number, number];
    readonly values: ArrayLike<number>;
}

/**
 * Densidade de um `FogVolume`: a extinção constante (1/m), uma função WGSL ou um grafo de nós do ponto `fog_density`
 * (a densidade relativa no ponto, × `extinction`), ou uma grade de valores relativos (× `extinction`).
 */
export type FogDensity = number | ExtensionFunctionOptions | { readonly grid: FogDensityGrid };

/** Valores de um `FogVolume`. */
export interface FogVolumeValues {
    /** Forma. Padrão: caixa de 10 × 10 × 10 m. */
    readonly shape?: FogShape;
    /** Centro (mundo). Padrão: a origem. */
    readonly center?: readonly [number, number, number];
    /** Densidade (constante em 1/m, função, grafo ou grade). Padrão 0,05/m. */
    readonly density?: FogDensity;
    /** Extinção (1/m) na densidade relativa 1 — com função, grafo ou grade. Padrão 1. */
    readonly extinction?: number;
    /** Albedo de espalhamento (rgb em [0, 1]: o resto da extinção é absorção). Padrão branco 0,9. */
    readonly albedo?: readonly [number, number, number];
    /** Anisotropia de Henyey-Greenstein em (−1, 1): positiva espalha para a frente (os feixes contra a luz). Padrão 0,3. */
    readonly anisotropy?: number;
    /** Emissão: a radiância (rgb) que a névoa opticamente espessa teria sozinha. Padrão nenhuma. */
    readonly emission?: readonly [number, number, number];
    /** Largura (m) da borda suave da forma: a densidade cai a 0 até a superfície dela. Padrão 0 (borda nítida). */
    readonly edge?: number;
}

/** A densidade dos valores: o tipo, a extinção, a grade (validada) ou a função criada. */
function densityOf(values: FogVolumeValues): {
    kind: number;
    extinction: number;
    grid: FogDensityGrid | undefined;
    fn: DensityFunction | undefined;
} {
    const density = values.density ?? 0.05;
    if (typeof density === 'number')
        return { kind: FOG_DENSITY.constant, extinction: density, grid: undefined, fn: undefined };
    const extinction = values.extinction ?? 1;
    if (!('grid' in density))
        return {
            kind: FOG_DENSITY.function,
            extinction,
            grid: undefined,
            fn: new DensityFunction(density),
        };
    const grid = density.grid;
    const [nx, ny, nz] = grid.size;
    if (![nx, ny, nz].every((n) => Number.isInteger(n) && n >= 2))
        throw new RangeError('FogVolume: grade com ao menos 2 valores por eixo');
    if (grid.values.length !== nx * ny * nz)
        throw new RangeError(
            `FogVolume: grade ${nx}×${ny}×${nz} pede ${nx * ny * nz} valores, recebeu ${grid.values.length}`,
        );
    return { kind: FOG_DENSITY.grid, extinction, grid, fn: undefined };
}

/** Dado de um `FogVolume` (o que o estágio dos froxels empacota no buffer dos meios). */
export interface FogVolumeData {
    shape: number;
    density: number;
    center: number[];
    /** Meias-medidas da caixa (xyz) ou o raio (x). */
    extent: number[];
    extinction: number;
    albedo: number[];
    anisotropy: number;
    emission: number[];
    edge: number;
    /** Medidas da grade (0 sem ela). */
    gridSize: number[];
    /** Valores da grade (descritor `grid`; vazio sem ela). */
    grid: Float32Array;
}

/**
 * Névoa, neblina ou fumaça (Camada 3, spec 033, R12): um meio participante numa caixa ou esfera, de densidade constante,
 * por função ou grafo de nós (ponto `fog_density`: ruído, campos) ou por uma grade de valores (o descritor `grid`, que
 * outro estágio também pode escrever na GPU). A luz do sol atravessa e forma feixes (a sombra recorta o meio), a névoa
 * recebe o céu e a luz rebatida, atenua o que está atrás pela distância (Beer-Lambert) e a luz que a atravessa (as
 * superfícies dentro dela e os raios da iluminação global). Mudar valores vale no quadro seguinte sem recompilar.
 */
export class FogVolume extends Entity<FogVolumeData> implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    /** A função de densidade (criada da opção `density` de função ou grafo), anexada à entidade do volume. */
    readonly densityFunction: DensityFunction | undefined;

    constructor(values: FogVolumeValues = {}) {
        super();
        const shape = values.shape ?? { box: [10, 10, 10] };
        const { kind, extinction, grid, fn } = densityOf(values);
        this.data = {
            shape: 'box' in shape ? FOG_SHAPE.box : FOG_SHAPE.sphere,
            density: kind,
            center: [...(values.center ?? [0, 0, 0])],
            extent:
                'box' in shape
                    ? [shape.box[0] / 2, shape.box[1] / 2, shape.box[2] / 2]
                    : [shape.sphere, shape.sphere, shape.sphere],
            extinction,
            albedo: [...(values.albedo ?? [0.9, 0.9, 0.9])],
            anisotropy: values.anisotropy ?? 0.3,
            emission: [...(values.emission ?? [0, 0, 0])],
            edge: values.edge ?? 0,
            gridSize: grid === undefined ? [0, 0, 0] : [...grid.size],
            grid: grid === undefined ? new Float32Array(0) : Float32Array.from(grid.values),
        };
        this.validate();
        this.densityFunction = fn;
        if (fn !== undefined) this.add(fn);
    }

    /** Confere os intervalos (lança `RangeError` nomeando o valor). */
    validate(): void {
        const d = this.rawData;
        const check = (ok: boolean, message: string): void => {
            if (!ok) throw new RangeError(`FogVolume: ${message}`);
        };
        check(
            d.extent.every((e) => Number.isFinite(e) && e > 0),
            'medidas da forma devem ser > 0',
        );
        check(
            Number.isFinite(d.extinction) && d.extinction >= 0,
            `extinção ${d.extinction} deve ser ≥ 0`,
        );
        check(
            d.albedo.every((a) => a >= 0 && a <= 1),
            'albedo em [0, 1]',
        );
        check(d.anisotropy > -1 && d.anisotropy < 1, `anisotropia ${d.anisotropy} em (−1, 1)`);
        check(
            d.emission.every((e) => Number.isFinite(e) && e >= 0),
            'emissão ≥ 0',
        );
        check(Number.isFinite(d.edge) && d.edge >= 0, `borda ${d.edge} deve ser ≥ 0`);
    }

    /** A grade de densidade (só com ela): escrita pela CPU na criação e por quem a produz na GPU. */
    getDescriptors(): readonly GPUDescriptor[] {
        const d = this.rawData;
        if (d.grid.length === 0) return [];
        return [
            {
                id: 'grid',
                role: 'storage-rw',
                schema: FogGridSchema,
                count: d.grid.length,
                upload: 'initial',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
