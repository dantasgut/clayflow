import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FluidSurfaceMaterialSchema } from './FluidSurfaceMaterialSchema';
import { Material } from './Material';

/** Dado de um `FluidSurfaceMaterial` (layout de `FluidSurfaceMaterial.schema`). */
export interface FluidSurfaceMaterialData {
    /** Cor da luz devolvida pelo interior da água (dispersão), RGBA linear. */
    color: number[];
    /** Absorção por metro em cada canal (`rgb`; `w` sem uso): a luz transmitida cai como `exp(−absorção · espessura)`. */
    absorption: number[];
    /** Cor refletida pela superfície (ambiente/céu até a iluminação de ambiente da F4), RGBA linear. */
    ambient: number[];
    /** Índice de refração (Fresnel, refração na tela e nas cáusticas). */
    ior: number;
    /** Escala da parcela refletida. */
    reflectivity: number;
    /** Expoente do brilho especular. */
    shininess: number;
    /** Raio da esfera de cada partícula em mundo; 0 = automático (0,6 × espaçamento do `ParticleMaterial`). */
    particleRadius: number;
    /** Raio da suavização da superfície em múltiplos do raio da partícula. */
    smoothingRadius: number;
    /** Descontinuidade de silhueta em múltiplos do raio: além dela a suavização não mistura profundidades. */
    depthThreshold: number;
    /** Escala da espessura acumulada (absorção e dispersão). */
    thicknessScale: number;
    /** Deslocamento da refração na tela por unidade de inclinação da superfície. */
    refraction: number;
    /** Cáusticas ligadas (1) ou desligadas (0). */
    caustics: number;
    /** Escala do padrão das cáusticas (1 = físico; 0 = só a atenuação da luz pela água). */
    causticIntensity: number;
    /** Preenchimento do layout. */
    _pad0: number;
    /** Preenchimento do layout. */
    _pad1: number;
}

/** Opções do `FluidSurfaceMaterial`: os campos do dado, com `caustics` booleano. */
export interface FluidSurfaceMaterialOptions extends Partial<
    Omit<
        FluidSurfaceMaterialData,
        'caustics' | 'color' | 'absorption' | 'ambient' | '_pad0' | '_pad1'
    >
> {
    /** Cor da dispersão interna, RGBA linear. */
    readonly color?: readonly number[];
    /** Absorção por metro (rgb). */
    readonly absorption?: readonly number[];
    /** Cor refletida, RGBA linear. */
    readonly ambient?: readonly number[];
    /** Cáusticas ligadas. Padrão `true`. */
    readonly caustics?: boolean;
}

/**
 * Material de água (spec 017) para corpos de partículas (`FluidBody`, e também `SoftBody`): o corpo é desenhado como uma
 * superfície contínua — não como esferas — com refração do que está atrás, absorção pela espessura, reflexão com
 * Fresnel e, sob a luz que projeta sombra, cáusticas no fundo e nos objetos submersos.
 *
 * Desenhado pelos estágios da água (`FluidSurfaceFlow`, `CausticsFlow`, `WaterFlow`); não tem shader de forward (numa
 * `Geometry`, não é desenhado) e não projeta sombra: a água atenua a luz que passa, não a bloqueia.
 *
 *     body.add(new FluidSurfaceMaterial({ absorption: [0.45, 0.09, 0.06, 0], caustics: true }));
 */
export class FluidSurfaceMaterial extends Material<FluidSurfaceMaterialData> {
    /** StructSchema do material de água (struct WGSL próprio). */
    static readonly schema = FluidSurfaceMaterialSchema;

    constructor(options: FluidSurfaceMaterialOptions = {}) {
        super();
        const ior = options.ior ?? 1.333;
        if (!(ior >= 1)) throw new Error(`FluidSurfaceMaterial: ior deve ser ≥ 1 (recebeu ${ior})`);
        this.data = {
            color: vec4('color', options.color ?? [0.1, 0.45, 0.6, 1]),
            absorption: vec4('absorption', options.absorption ?? [0.45, 0.09, 0.06, 0], true),
            ambient: vec4('ambient', options.ambient ?? [0.62, 0.72, 0.85, 1]),
            ior,
            reflectivity: nonNegative('reflectivity', options.reflectivity ?? 1),
            shininess: nonNegative('shininess', options.shininess ?? 256),
            particleRadius: nonNegative('particleRadius', options.particleRadius ?? 0),
            smoothingRadius: nonNegative('smoothingRadius', options.smoothingRadius ?? 4),
            depthThreshold: positive('depthThreshold', options.depthThreshold ?? 4),
            thicknessScale: nonNegative('thicknessScale', options.thicknessScale ?? 1),
            refraction: nonNegative('refraction', options.refraction ?? 0.05),
            caustics: (options.caustics ?? true) ? 1 : 0,
            causticIntensity: nonNegative('causticIntensity', options.causticIntensity ?? 1),
            _pad0: 0,
            _pad1: 0,
        };
        this.castsShadow = false;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'material',
                role: 'storage-ro',
                schema: FluidSurfaceMaterial.schema,
                storage: 'pool',
            },
        ];
    }

    /** Sem shader de forward: a superfície é desenhada pelos estágios da água. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Topologia: pontos (o corpo é desenhado a partir das partículas). */
    override get topology(): GPUPrimitiveTopology {
        return 'point-list';
    }
}

function vec4(name: string, v: readonly number[], nonNegativeRgb = false): number[] {
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) {
        throw new Error(`FluidSurfaceMaterial: ${name} deve ter 4 números finitos`);
    }
    if (nonNegativeRgb && v.slice(0, 3).some((x) => x < 0)) {
        throw new Error(`FluidSurfaceMaterial: ${name} não pode ser negativa`);
    }
    return [...v];
}

function nonNegative(name: string, v: number): number {
    if (!(v >= 0) || !Number.isFinite(v)) {
        throw new Error(`FluidSurfaceMaterial: ${name} deve ser ≥ 0 (recebeu ${v})`);
    }
    return v;
}

function positive(name: string, v: number): number {
    if (!(v > 0) || !Number.isFinite(v)) {
        throw new Error(`FluidSurfaceMaterial: ${name} deve ser > 0 (recebeu ${v})`);
    }
    return v;
}
