import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { DistanceConstraint, XPBD_SERIAL_COLOR } from '../constraints/DistanceConstraint';
import { SurfaceGeometry } from '../../geometry/SurfaceGeometry';
import { XPBDSoftSchema } from './schemas/XPBDSoftSchema';
import { FEMSchema } from './schemas/FEMSchema';
import { MPM_REST_DEFORMATION, MPMSoftSchema } from './schemas/MPMSoftSchema';
import {
    BODY_ENERGY_HISTORY,
    SOFT_ENERGY_ALGORITHM,
    SoftBodyChunkSchema,
    SoftBodyEnergySchema,
    SoftBodyPartialSchema,
    SoftBodyRangeSchema,
    softEnergyChunks,
} from '../energy/schemas';
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

/** O algoritmo pelo schema das partículas (o corpo cru também tem série de energia se o schema é de um dos três). */
function algorithmOf(schema: StructSchema): SoftBodyAlgorithm | undefined {
    return (Object.keys(SOFT_SCHEMAS) as SoftBodyAlgorithm[]).find(
        (a) => SOFT_SCHEMAS[a] === schema,
    );
}

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
     * `ParticlePhysics` da cena).
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
    /** A faixa do corpo para a série de energia (`SoftBodyRange`; inícios locais, resolvidos pela C2). */
    range?: ParticleFields;
    /** Os blocos da energia (`SoftBodyChunk`: a faixa, resolvida pela C2, e o índice de cada um). */
    chunks?: ParticleFields;
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
    /** Algoritmo do corpo (pelo schema das partículas), ou `undefined` num corpo cru de outro schema. */
    readonly algorithm: SoftBodyAlgorithm | undefined;
    /** Cores das arestas (spec 034, T061b): os despachos de cor que o solver precisa para este corpo (0 sem arestas). */
    readonly edgeColors: number = 0;

    constructor(options: SoftBodyOptions) {
        if (isRaw(options)) {
            super('SoftBody', options.schema, options.count);
            this.edgeCount = 0;
            this.algorithm = algorithmOf(options.schema);
            this.data = { body: { ...options.data }, ...this.rangeData() };
            return;
        }
        const schema = SOFT_SCHEMAS[options.algorithm] as StructSchema | undefined;
        if (schema === undefined) {
            throw new Error(`SoftBody: algoritmo desconhecido '${options.algorithm}'`);
        }
        const count = particleCount('SoftBody', options.position);
        super('SoftBody', schema, count);
        this.algorithm = options.algorithm;
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
        const fields = edges === undefined ? undefined : edgeFields(edges, options.position, count);
        if (fields !== undefined) this.edgeColors = 1 + Math.max(...(fields.color as Uint32Array));
        this.data =
            fields === undefined
                ? { body, ...this.rangeData() }
                : { body, edges: fields, ...this.rangeData() };
    }

    /** Blocos da energia do corpo (um grupo da GPU por bloco). */
    get energyChunks(): number {
        return softEnergyChunks(this.count, this.edgeCount);
    }

    /**
     * O registro da faixa (`SoftBodyRange`) e os blocos (`SoftBodyChunk`), com os inícios locais — a C2 soma o primeiro
     * slot de cada faixa.
     */
    private rangeData(): Pick<SoftBodyData, 'range' | 'chunks'> {
        if (this.algorithm === undefined) return {};
        const chunks = this.energyChunks;
        return {
            range: {
                first: [0],
                count: [this.count],
                first_edge: [0],
                edge_count: [this.edgeCount],
                algorithm: [SOFT_ENERGY_ALGORITHM[this.algorithm]],
                first_chunk: [0],
                chunk_count: [chunks],
                edge_colors: [this.edgeColors],
            },
            chunks: {
                range: new Uint32Array(chunks),
                chunk: Uint32Array.from({ length: chunks }, (_, k) => k),
            },
        };
    }

    /**
     * Partículas e, com arestas, a faixa de restrições de distância (enviadas só na inserção); num corpo de um dos três
     * algoritmos, a faixa do corpo (`SoftBodyRange`) e os blocos da energia (`SoftBodyChunk`), enviados na inserção, a
     * soma de cada bloco (`SoftBodyPartial`) e a série temporal da energia (spec 037: o canal `SoftBodyEnergy`, de 8
     * fatias, no mesmo slot da faixa) — as duas últimas alocadas só quando um `EnergyMeter` as pede.
     */
    override getDescriptors(): readonly GPUDescriptor[] {
        const out: GPUDescriptor[] = [this.bodyDescriptor()];
        if (this.edgeCount > 0)
            out.push({
                id: 'edges',
                role: 'storage-ro',
                schema: DistanceConstraint.schema,
                storage: 'pool',
                upload: 'initial',
                count: this.edgeCount,
                slotRefs: { i: 'self:body', j: 'self:body' },
            });
        if (this.algorithm === undefined) return out;
        const chunks = this.energyChunks;
        out.push(
            {
                id: 'range',
                role: 'storage-ro',
                schema: SoftBodyRangeSchema,
                storage: 'pool',
                upload: 'initial',
                count: 1,
                slotRefs:
                    this.edgeCount > 0
                        ? {
                              first: 'self:body',
                              first_edge: 'self:edges',
                              first_chunk: 'self:chunks',
                          }
                        : { first: 'self:body', first_chunk: 'self:chunks' },
            },
            {
                id: 'chunks',
                role: 'storage-ro',
                schema: SoftBodyChunkSchema,
                storage: 'pool',
                upload: 'initial',
                count: chunks,
                slotRefs: { range: 'self:range' },
            },
            {
                id: 'partials',
                role: 'storage-rw',
                schema: SoftBodyPartialSchema,
                storage: 'pool',
                upload: 'never',
                allocation: 'onDemand',
                count: chunks,
            },
            {
                id: 'energy',
                role: 'storage-rw',
                schema: SoftBodyEnergySchema,
                storage: 'pool',
                upload: 'never',
                allocation: 'onDemand',
                // Um registro (sem `count`: a C2 o conta como 1, no grupo e no slot da faixa); lido como o do
                // `RigidBody`, campo a campo.
                history: { depth: BODY_ENERGY_HISTORY },
            },
        );
        return out;
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
    const color = edgeColors(i, j, count);
    // As arestas em ordem de cor (estável): cada cor é um trecho contíguo, que o grupo de trabalho do corpo percorre
    // sozinho (sem passar pelas das outras cores).
    const order = Array.from({ length: e }, (_, k) => k).sort(
        (x, y) => color[x]! - color[y]! || x - y,
    );
    const pick = <T extends Uint32Array | Float32Array>(src: T): T => {
        const out = new (src.constructor as new (n: number) => T)(e);
        for (let k = 0; k < e; k++) out[k] = src[order[k]!]!;
        return out;
    };
    return {
        i: pick(i),
        j: pick(j),
        rest_length: pick(rest),
        compliance: pick(comp),
        color: pick(color),
    };
}

/**
 * Coloração gulosa das arestas (spec 034, T061b): cada aresta recebe a menor cor que nenhuma aresta dos seus dois nós
 * já usa — as da mesma cor não compartilham nó, e o solver as resolve em paralelo sem corrida, uma cor depois da outra
 * (Gauss-Seidel por cor). Com grau máximo d, no máximo 2d − 1 cores; acima de `XPBD_SERIAL_COLOR`, o corpo é recusado.
 * Feita uma vez na criação do corpo, com o resto da montagem das arestas.
 */
function edgeColors(i: Uint32Array, j: Uint32Array, count: number): Uint32Array {
    const used = new Uint32Array(count);
    const color = new Uint32Array(i.length);
    for (let k = 0; k < i.length; k++) {
        const busy = used[i[k]!]! | used[j[k]!]!;
        let c = 0;
        while (c < XPBD_SERIAL_COLOR && (busy & (1 << c)) !== 0) c++;
        if (c >= XPBD_SERIAL_COLOR) {
            throw new RangeError(
                `SoftBody: as arestas pedem mais de ${XPBD_SERIAL_COLOR} cores (nó de grau alto demais para o solver).`,
            );
        }
        color[k] = c;
        used[i[k]!]! |= 1 << c;
        used[j[k]!]! |= 1 << c;
    }
    return color;
}
