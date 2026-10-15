import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { Geometry, type GeometryData } from './Geometry';
import { triangleEdges } from './geometryContent';
import { SurfaceGeometry } from './SurfaceGeometry';

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
}

/** Dado de uma `ParametricSurface`. */
export interface ParametricSurfaceData extends GeometryData {
    resolution: [number, number];
    domain: [number, number, number, number];
    preset: SurfacePreset;
    params: number[];
    animated: boolean;
    indices: Uint32Array;
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
 * cria outra geometria (os índices são da construção); domínio, pronta e parâmetros podem mudar em execução.
 */
export class ParametricSurface extends Geometry<ParametricSurfaceData> {
    /** Vértice (posição, normal, uv) — o mesmo das superfícies dos corpos moles. */
    static readonly vertexStruct = SurfaceGeometry.vertexStruct;

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
        const domain = options.domain ?? PRESET_DOMAIN[preset];
        if (
            domain.length !== 4
            || !domain.every(Number.isFinite)
            || domain[0] === domain[1]
            || domain[2] === domain[3]
        ) {
            throw new RangeError('ParametricSurface: domínio [u0, u1, v0, v1] finito e não vazio.');
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
        ];
    }

    get vertexCount(): number {
        return this.data.vertexCount;
    }

    get indexCount(): number {
        return this.data.indexCount;
    }

    /** Vértices escritos na GPU, próprios de cada superfície: sem deduplicação por conteúdo. */
    override get contentKey(): string | undefined {
        return undefined;
    }
}
