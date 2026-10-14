import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { SurfaceGeometry } from '../../geometry/SurfaceGeometry';
import { XPBDSoftSchema } from './schemas/XPBDSoftSchema';
import { FEMSchema } from './schemas/FEMSchema';
import { MPM_REST_DEFORMATION, MPMSoftSchema } from './schemas/MPMSoftSchema';
import {
    ParticleBody,
    particleCount,
    repeated,
    requireLength,
    vec4Of,
    type ParticleBodyData,
    type ParticleBodyRawOptions,
    type ParticleFields,
    type ParticlePositions,
} from './ParticleBody';

/** Algoritmo de soft body, em vocabulário de domínio. */
export type SoftBodyAlgorithm = 'XPBD' | 'FEM' | 'MPM';

const SOFT_SCHEMAS: Record<SoftBodyAlgorithm, StructSchema> = {
    XPBD: XPBDSoftSchema,
    FEM: FEMSchema,
    MPM: MPMSoftSchema,
};

/** Restrições de distância internas de um corpo XPBD: pares de índices locais de partícula. */
export interface SoftBodyEdges {
    /** Primeira partícula de cada aresta (índice local, `< N`). */
    readonly a: ArrayLike<number>;
    /** Segunda partícula de cada aresta (índice local, `< N`). */
    readonly b: ArrayLike<number>;
    /** Comprimento de repouso de cada aresta (m). Default: a distância inicial entre as duas partículas. */
    readonly restLength?: ArrayLike<number>;
    /** Compliance de cada aresta (m/N; 0 = rígida), ou um valor para todas. Default 0. */
    readonly compliance?: ArrayLike<number> | number;
}

/**
 * Opções de domínio do SoftBody — o corpo inteiro: N partículas em arrays e, no XPBD, as restrições de distância
 * internas. `pos.w` carrega o inverso da massa.
 */
export interface SoftBodyDomainOptions {
    /**
     * Seleciona o schema e o estágio que simula: XPBD, FEM ou MPM (sólido elástico; massa, volume e rigidez vêm do
     * `ParticleMaterial` da cena).
     */
    readonly algorithm: SoftBodyAlgorithm;
    /** Posições iniciais (mundo): `x, y, z` por partícula; o tamanho define N. */
    readonly position: ParticlePositions;
    /** Massa de cada partícula (kg), ou uma para todas. 0 ⇒ fixa (inv_mass = 0). Default 0. Ignorada no MPM. */
    readonly mass?: ArrayLike<number> | number;
    /** Restrições de distância internas (só XPBD), resolvidas na faixa do próprio corpo. */
    readonly edges?: SoftBodyEdges;
    /**
     * Superfície desenhada como malha (spec 008): triângulos sobre as partículas (índices locais) e uvs opcionais. Cria
     * uma `SurfaceGeometry` como parte do corpo, cujos vértices um estágio recalcula na GPU a cada quadro; com um
     * material de superfície e um `Transform` na entidade, o corpo é desenhado (e projeta sombra) como malha.
     */
    readonly surface?: SoftBodySurface;
}

/** Superfície de um corpo mole: triângulos sobre as partículas. */
export interface SoftBodySurface {
    /** Triângulos: 3 índices locais de partícula por triângulo (anti-horário visto de fora). */
    readonly triangles: ArrayLike<number>;
    /** Coordenadas de textura: `u, v` por partícula. Default zero. */
    readonly uvs?: ArrayLike<number>;
}

/** Opções cruas do SoftBody: schema, contagem e dado por campo. */
export type SoftBodyRawOptions = ParticleBodyRawOptions;

/** União aceita pelo construtor do SoftBody: vocabulário de domínio ou struct cru. */
export type SoftBodyOptions = SoftBodyDomainOptions | SoftBodyRawOptions;

/** Dado de um `SoftBody`: as partículas e as arestas por campo. */
export interface SoftBodyData extends ParticleBodyData {
    /** Arestas no layout de `DistanceConstraint` (`i`/`j` locais, resolvidos pela C2 na faixa do corpo). */
    edges?: ParticleFields;
}

function isRaw(o: SoftBodyOptions): o is SoftBodyRawOptions {
    return 'schema' in o;
}

/**
 * SoftBody — um corpo deformável (tecido, gelatina, malha FEM) de N partículas num único Resource (spec 008), na faixa
 * de N slots do pool do algoritmo (`XPBDSoftSchema`, `FEMSchema`, `MPMSoftSchema`), que roteia para o `XPBDFlow`,
 * `FEMFlow` ou `MPMFlow`. No XPBD, `edges` são restrições de distância do próprio corpo, numa faixa do pool
 * `DistanceConstraint` (índices locais; a C2 soma o início da faixa das partículas).
 *
 *  - **Domínio**: `new SoftBody({ algorithm: 'XPBD', position, mass, edges })`.
 *  - **Cru** (avançado): `new SoftBody({ schema, count, data })`.
 */
export class SoftBody extends ParticleBody<SoftBodyData> {
    /** Número de arestas (restrições de distância internas). */
    readonly edgeCount: number;
    /** Superfície desenhada como malha, se declarada (parte do corpo). */
    readonly surface: SurfaceGeometry | undefined = undefined;

    constructor(options: SoftBodyOptions) {
        if (isRaw(options)) {
            super('SoftBody', options.schema, options.count);
            this.edgeCount = 0;
            this.data = { body: { ...options.data } };
            return;
        }
        const schema = SOFT_SCHEMAS[options.algorithm] as StructSchema | undefined;
        if (schema === undefined) {
            throw new Error(`SoftBody: algoritmo desconhecido '${options.algorithm}'`);
        }
        const count = particleCount('SoftBody', options.position);
        super('SoftBody', schema, count);
        const mass = options.mass ?? 0;
        if (typeof mass !== 'number') requireLength('SoftBody', 'mass', mass, count, 1);
        const massOf = (i: number): number => (typeof mass === 'number' ? mass : (mass[i] ?? 0));
        for (let i = 0; i < count; i++) {
            if (massOf(i) < 0)
                throw new RangeError(
                    `SoftBody: massa deve ser ≥ 0 (partícula ${i}: ${massOf(i)}).`,
                );
        }
        const body: ParticleFields =
            options.algorithm === 'MPM'
                ? {
                      pos: vec4Of(options.position, count),
                      ...Object.fromEntries(
                          Object.entries(MPM_REST_DEFORMATION).map(([f, v]) => [
                              f,
                              repeated(v, count),
                          ]),
                      ),
                  }
                : // Predição inicial = posição: partículas fixas não passam pela predição e as restrições leem `pred`.
                  {
                      pos: vec4Of(options.position, count, (i) => {
                          const m = massOf(i);
                          return m > 0 ? 1 / m : 0;
                      }),
                      pred: vec4Of(options.position, count),
                  };
        const edges = options.edges;
        if (edges !== undefined && options.algorithm !== 'XPBD') {
            throw new Error(
                `SoftBody: edges (restrições de distância) são do XPBD; o algoritmo '${options.algorithm}' não as resolve.`,
            );
        }
        this.edgeCount = edges === undefined ? 0 : edges.a.length;
        if (options.surface !== undefined) {
            this.surface = new SurfaceGeometry(
                options.position,
                options.surface.triangles,
                options.surface.uvs,
            );
            this.add(this.surface);
        }
        this.data =
            edges === undefined
                ? { body }
                : { body, edges: edgeFields(edges, options.position, count) };
    }

    /** Partículas e, com arestas, a faixa de restrições de distância (enviadas só na inserção). */
    override getDescriptors(): readonly GPUDescriptor[] {
        const body = this.bodyDescriptor();
        if (this.edgeCount === 0) return [body];
        return [
            body,
            {
                id: 'edges',
                role: 'storage-ro',
                schema: DistanceConstraint.schema,
                storage: 'pool',
                upload: 'initial',
                count: this.edgeCount,
                slotRefs: { i: 'self:body', j: 'self:body' },
            },
        ];
    }
}

/** Arestas por campo no layout de `DistanceConstraint`, validadas contra as `count` partículas. */
function edgeFields(
    edges: SoftBodyEdges,
    position: ParticlePositions,
    count: number,
): ParticleFields {
    const e = edges.a.length;
    if (e < 1) throw new RangeError('SoftBody: edges sem arestas (a vazio).');
    requireLength('SoftBody', 'edges.b', edges.b, e, 1);
    if (edges.restLength !== undefined)
        requireLength('SoftBody', 'edges.restLength', edges.restLength, e, 1);
    const compliance = edges.compliance ?? 0;
    if (typeof compliance !== 'number')
        requireLength('SoftBody', 'edges.compliance', compliance, e, 1);
    const i = new Uint32Array(e);
    const j = new Uint32Array(e);
    const rest = new Float32Array(e);
    const comp = new Float32Array(e);
    for (let k = 0; k < e; k++) {
        const a = edges.a[k]!;
        const b = edges.b[k]!;
        for (const [name, v] of [
            ['a', a],
            ['b', b],
        ] as const) {
            if (!Number.isInteger(v) || v < 0 || v >= count) {
                throw new RangeError(
                    `SoftBody: edges.${name}[${k}] = ${v} fora das ${count} partículas do corpo.`,
                );
            }
        }
        i[k] = a;
        j[k] = b;
        rest[k] =
            edges.restLength?.[k]
            ?? Math.hypot(
                position[b * 3]! - position[a * 3]!,
                position[b * 3 + 1]! - position[a * 3 + 1]!,
                position[b * 3 + 2]! - position[a * 3 + 2]!,
            );
        comp[k] = typeof compliance === 'number' ? compliance : compliance[k]!;
    }
    return { i, j, rest_length: rest, compliance: comp };
}
