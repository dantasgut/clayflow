import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { Geometry, type GeometryData } from './Geometry';
import { triangleEdges } from './geometryContent';
import { SurfaceGeometry } from './SurfaceGeometry';
import { SurfaceDiffSchema } from './SurfaceSchemas';

/** Superfície pronta (spec 009): plano, esfera, toro ou terreno por ruído. */
export type SurfacePreset = 'plane' | 'sphere' | 'torus' | 'terrain';

/** Opções de `ParametricSurface`. */
export interface ParametricSurfaceOptions {
    /** Vértices em u e em v (≥ 2). Default [64, 32]. */
    readonly resolution?: readonly [number, number];
    /** Domínio [u0, u1, v0, v1]. Default pela superfície pronta (ex.: esfera [0, 2π, 0, π]). */
    readonly domain?: readonly [number, number, number, number];
    /** Superfície pronta quando a entidade não tem `SurfaceFunction`. Default `'plane'`. */
    readonly preset?: SurfacePreset;
    /**
     * Valores da pronta: esfera [raio]; toro [raio maior, raio menor]; terreno [altura, escala do ruído, oitavas].
     * Default por superfície (esfera 1; toro [1, 0,3]; terreno [0,5, 1, 4]).
     */
    readonly params?: readonly number[];
    /** A função depende do tempo: reavalia a cada quadro. Default false (reavalia quando algo muda). */
    readonly animated?: boolean;
    /**
     * Geometria diferencial por vértice (spec 010): métrica, segunda forma, curvaturas e direção principal no pool
     * `SurfaceDiff`, lidas pelo material (`SurfaceSample`). Default false. Fixo da construção.
     */
    readonly differential?: boolean;
    /**
     * Malha adaptativa (spec 010): mais triângulos onde a superfície curva mais e perto da câmera, sem frestas, contada e
     * desenhada pela GPU (desenho indireto). Liga `differential`. A malha uniforme (sem esta opção) continua o padrão.
     */
    readonly adaptive?: AdaptiveOptions;
}

/** Opções da malha adaptativa. */
export interface AdaptiveOptions {
    /** Retalhos em u e v (cada um com o seu nível). Default [16, 16]; P·Q ≤ 4096. */
    readonly patches?: readonly [number, number];
    /** Nível máximo L (2^L segmentos por lado do retalho). Default 4; ≤ 6. */
    readonly maxLevel?: number;
    /** Teto de triângulos (os níveis baixam juntos para caber). Default: o da malha no nível máximo. */
    readonly budget?: number;
    /** Erro de corda tolerado (m) — a curvatura pede segmentos menores. Default 0,002. */
    readonly tolerance?: number;
    /** Fração da altura da imagem que um segmento pode ocupar — a distância à câmera. Default 0,01. */
    readonly screen?: number;
    /** Domínio periódico em u e v (a borda encontra a oposta: sem fresta na costura). Default pela pronta. */
    readonly periodic?: readonly [boolean, boolean];
    /** Deslocamento da câmera (m) que refaz a malha. Default 0,05. */
    readonly refreshDistance?: number;
}

/** Malha adaptativa resolvida (valores efetivos). */
export interface AdaptiveConfig {
    readonly patches: readonly [number, number];
    readonly maxLevel: number;
    readonly budget: number;
    readonly tolerance: number;
    readonly screen: number;
    readonly periodic: readonly [boolean, boolean];
    readonly refreshDistance: number;
    /** Vértices por lado de um retalho no nível máximo (2^L + 1). */
    readonly side: number;
    /** Capacidades (nível máximo em todos os retalhos). */
    readonly vertexCapacity: number;
    readonly indexCapacity: number;
    readonly edgeIndexCapacity: number;
}

/** Dado de uma `ParametricSurface`. */
export interface ParametricSurfaceData extends GeometryData {
    resolution: [number, number];
    domain: [number, number, number, number];
    preset: SurfacePreset;
    params: number[];
    animated: boolean;
    /** Índices fixos da grade uniforme (ausentes na adaptativa: escritos pela GPU). */
    indices?: Uint32Array;
    vertexCount: number;
    indexCount: number;
}

const PRESET_DOMAIN: Record<SurfacePreset, [number, number, number, number]> = {
    plane: [-1, 1, -1, 1],
    sphere: [0, 2 * Math.PI, 0, Math.PI],
    torus: [0, 2 * Math.PI, 0, 2 * Math.PI],
    terrain: [-4, 4, -4, 4],
};
const PRESET_PARAMS: Record<SurfacePreset, number[]> = {
    plane: [],
    sphere: [1],
    torus: [1, 0.3],
    terrain: [0.5, 1, 4],
};

/** Índice da superfície pronta no shader (`surface_fn_ready.wgsl`). */
export const SURFACE_PRESET_INDEX: Record<SurfacePreset, number> = {
    plane: 0,
    sphere: 1,
    torus: 2,
    terrain: 3,
};

/**
 * Superfície paramétrica avaliada na GPU (spec 009): uma grade u × v cujos vértices (posição, normal, uv) o
 * `SurfaceFlow` escreve a partir da função `surface` da entidade (`SurfaceFunction`) ou da superfície pronta
 * (`preset`), com o espaço da cena aplicado (`SpaceFunction`). Índices fixos da grade (dois triângulos por célula, face
 * da frente para o lado de du × dv). Desenhada pelo forward e pela sombra como qualquer geometria. Mudar a resolução
 * cria outra geometria (os índices são da construção); domínio, pronta e parâmetros podem mudar em execução. Com
 * `differential` (spec 010), cada vértice tem também a geometria diferencial no pool `SurfaceDiff`.
 */
export class ParametricSurface extends Geometry<ParametricSurfaceData> {
    /** Vértice (posição, normal, uv) — o mesmo das superfícies dos corpos moles. */
    static readonly vertexStruct = SurfaceGeometry.vertexStruct;

    /** Tem geometria diferencial por vértice (pool `SurfaceDiff`). */
    readonly differential: boolean;
    /** Malha adaptativa (valores efetivos), ou `undefined` na uniforme. */
    readonly adaptive: AdaptiveConfig | undefined;

    constructor(options: ParametricSurfaceOptions = {}) {
        super();
        const [nu, nv] = options.resolution ?? [64, 32];
        for (const n of [nu, nv]) {
            if (!Number.isInteger(n) || n < 2 || n > 4096) {
                throw new RangeError(
                    `ParametricSurface: resolução ${nu} × ${nv} fora de [2, 4096] por eixo.`,
                );
            }
        }
        const preset = options.preset ?? 'plane';
        this.adaptive =
            options.adaptive === undefined ? undefined : adaptiveOf(options.adaptive, preset);
        this.differential = (options.differential ?? false) || this.adaptive !== undefined;
        const domain = options.domain ?? PRESET_DOMAIN[preset];
        if (
            domain.length !== 4
            || !domain.every(Number.isFinite)
            || domain[0] === domain[1]
            || domain[2] === domain[3]
        ) {
            throw new RangeError('ParametricSurface: domínio [u0, u1, v0, v1] finito e não vazio.');
        }
        const adaptive = this.adaptive;
        if (adaptive !== undefined) {
            const [p, q] = adaptive.patches;
            const n = 2 ** adaptive.maxLevel;
            this.data = {
                // A grade uniforme de mesma precisão máxima (referência).
                resolution: [p * n + 1, q * n + 1],
                domain: [...domain] as [number, number, number, number],
                preset,
                params: [...(options.params ?? PRESET_PARAMS[preset])],
                animated: options.animated ?? false,
                vertexCount: adaptive.vertexCapacity,
                indexCount: adaptive.indexCapacity,
            };
            return;
        }
        const indices = new Uint32Array((nu - 1) * (nv - 1) * 6);
        let k = 0;
        for (let iv = 0; iv + 1 < nv; iv++) {
            for (let iu = 0; iu + 1 < nu; iu++) {
                const a = iv * nu + iu;
                const b = a + 1;
                const c = a + nu;
                const d = c + 1;
                indices.set([a, b, c, b, d, c], k);
                k += 6;
            }
        }
        this.data = {
            resolution: [nu, nv],
            domain: [...domain] as [number, number, number, number],
            preset,
            params: [...(options.params ?? PRESET_PARAMS[preset])],
            animated: options.animated ?? false,
            indices,
            vertexCount: nu * nv,
            indexCount: indices.length,
            wireEdges: triangleEdges(indices),
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const adaptive = this.adaptive;
        if (adaptive !== undefined) return this.adaptiveDescriptors(adaptive);
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: ParametricSurface.vertexStruct,
                count: this.data.vertexCount,
                // Escritos só pelo `SurfaceFlow`.
                upload: 'never',
            },
            { id: 'indices', role: 'index', count: this.data.indexCount },
            ...this.wireDescriptors(),
            ...(this.differential
                ? [
                      {
                          id: 'diff',
                          role: 'storage-rw' as const,
                          schema: SurfaceDiffSchema,
                          storage: 'pool' as const,
                          // Escrita só pelo `SurfaceFlow`, um registro por vértice.
                          upload: 'never' as const,
                          count: this.data.vertexCount,
                      },
                  ]
                : []),
        ];
    }

    /**
     * Malha adaptativa: vértices, índices, arestas do arame e geometria diferencial com a capacidade do nível máximo,
     * todos escritos pela GPU, e o registro indireto (índices do desenho e vértices do arame, contados na GPU).
     */
    private adaptiveDescriptors(a: AdaptiveConfig): GPUDescriptor[] {
        return [
            {
                id: 'vertices',
                role: 'vertex',
                schema: ParametricSurface.vertexStruct,
                count: a.vertexCapacity,
                upload: 'never',
            },
            {
                id: 'indices',
                role: 'index',
                count: a.indexCapacity,
                upload: 'never',
                indexFormat: 'uint32',
            },
            {
                id: 'wireEdges',
                role: 'index',
                count: a.edgeIndexCapacity,
                upload: 'never',
                indexFormat: 'uint32',
            },
            // Registro 0: desenho indexado; registro 1 (byte 20): arame (6 vértices por aresta).
            { id: 'indirect', role: 'indirect', count: 2, upload: 'never' },
            {
                id: 'diff',
                role: 'storage-rw',
                schema: SurfaceDiffSchema,
                storage: 'pool',
                upload: 'never',
                count: a.vertexCapacity,
            },
        ];
    }

    get vertexCount(): number {
        return this.data.vertexCount;
    }

    get indexCount(): number {
        return this.data.indexCount;
    }

    /** Índices de 32 bits (a grade uniforme e a adaptativa). */
    override get indexFormat(): GPUIndexFormat {
        return 'uint32';
    }

    /** Vértices escritos na GPU, próprios de cada superfície: sem deduplicação por conteúdo. */
    override get contentKey(): string | undefined {
        return undefined;
    }
}

/** Domínio periódico das prontas (u, v): esfera em u; toro nos dois. */
const PRESET_PERIODIC: Record<SurfacePreset, readonly [boolean, boolean]> = {
    plane: [false, false],
    sphere: [true, false],
    torus: [true, true],
    terrain: [false, false],
};

/** Valores efetivos da malha adaptativa, validados. */
function adaptiveOf(o: AdaptiveOptions, preset: SurfacePreset): AdaptiveConfig {
    const [p, q] = o.patches ?? [16, 16];
    if (!Number.isInteger(p) || !Number.isInteger(q) || p < 1 || q < 1 || p * q > 4096)
        throw new RangeError(`ParametricSurface: retalhos ${p} × ${q} fora de [1, 4096] no total.`);
    const maxLevel = o.maxLevel ?? 4;
    if (!Number.isInteger(maxLevel) || maxLevel < 0 || maxLevel > 6)
        throw new RangeError(`ParametricSurface: nível máximo ${maxLevel} fora de [0, 6].`);
    const n = 2 ** maxLevel;
    const full = p * q * 2 * n * n;
    const budget = o.budget ?? full;
    if (!Number.isInteger(budget) || budget < 2 * p * q)
        throw new RangeError(
            `ParametricSurface: orçamento ${budget} abaixo de 2 triângulos por retalho.`,
        );
    const tolerance = o.tolerance ?? 0.002;
    const screen = o.screen ?? 0.01;
    const refreshDistance = o.refreshDistance ?? 0.05;
    for (const [name, v] of [
        ['tolerância', tolerance],
        ['fração da tela', screen],
        ['deslocamento de refação', refreshDistance],
    ] as const) {
        if (!(v > 0) || !Number.isFinite(v))
            throw new RangeError(`ParametricSurface: ${name} ${v} inválida (> 0).`);
    }
    const side = n + 1;
    return {
        patches: [p, q],
        maxLevel,
        budget: Math.min(budget, full),
        tolerance,
        screen,
        periodic: o.periodic ?? PRESET_PERIODIC[preset],
        refreshDistance,
        side,
        vertexCapacity: p * q * side * side,
        indexCapacity: p * q * 6 * n * n,
        edgeIndexCapacity: p * q * (6 * n * n + 4 * n),
    };
}
