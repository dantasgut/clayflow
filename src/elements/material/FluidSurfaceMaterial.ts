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
    /**
     * @deprecated Spec 011: a superfície reflete o hemisfério e as luzes da cena (`HemisphereLight`), não uma cor
     * constante. Ignorado pelo desenho.
     */
    ambient: number[];
    /** Índice de refração (Fresnel exato, especular, refração na tela e nas cáusticas). */
    ior: number;
    /** @deprecated Spec 011: a parcela refletida é a do Fresnel físico. Ignorado pelo desenho. */
    reflectivity: number;
    /** @deprecated Spec 011: use `roughness` (convertido na construção quando `roughness` não vem). */
    shininess: number;
    /** @deprecated Spec 033: a superfície é a do campo dos fluidos (núcleos pelo espaçamento). Ignorado. */
    particleRadius: number;
    /** @deprecated Spec 033: sem suavização na tela (a superfície do campo é contínua). Ignorado. */
    smoothingRadius: number;
    /** @deprecated Spec 033: sem suavização na tela (a superfície do campo é contínua). Ignorado. */
    depthThreshold: number;
    /** Escala da espessura acumulada (absorção e dispersão). */
    thicknessScale: number;
    /** Deslocamento da refração na tela por unidade de inclinação da superfície. */
    refraction: number;
    /** Cáusticas ligadas (1) ou desligadas (0). */
    caustics: number;
    /** Escala do padrão das cáusticas (1 = físico; 0 = só a atenuação da luz pela água). */
    causticIntensity: number;
    /**
     * Ondulações capilares procedurais (inclinação máxima somada à normal): o detalhe que a simulação não resolve
     * (ondas de milímetros a centímetros) — afeta refração, reflexo e cáusticas. 0 desliga.
     */
    rippleStrength: number;
    /** Comprimento da maior ondulação (m). */
    rippleSize: number;
    /** Escala da velocidade das ondulações (1 = dispersão de águas profundas). */
    rippleSpeed: number;
    /** Rugosidade do especular da superfície (GGX, spec 011): 0,02 = água calma. */
    roughness: number;
    /**
     * Número de Abbe (dispersão: o IOR por cor, as cores se separam na refração e nas cáusticas); 55,7 = água, 0 = sem
     * dispersão.
     */
    abbe: number;
    /** Preenchimento do layout. */
    _pad2: number;
}

/** Opções do `FluidSurfaceMaterial`: os campos do dado, com `caustics` booleano. */
export interface FluidSurfaceMaterialOptions extends Partial<
    Omit<FluidSurfaceMaterialData, 'caustics' | 'color' | 'absorption' | 'ambient' | '_pad2'>
> {
    /** Cor da dispersão interna, RGBA linear. */
    readonly color?: readonly number[];
    /** Absorção por metro (rgb). */
    readonly absorption?: readonly number[];
    /** @deprecated Spec 011: a superfície reflete o hemisfério e as luzes da cena. */
    readonly ambient?: readonly number[];
    /** Cáusticas ligadas. Padrão `true`. */
    readonly caustics?: boolean;
}

/** Campos obsoletos já avisados (aviso único por campo). */
const warnedObsolete = new Set<string>();

/** Avisa uma vez por campo obsoleto (spec 011) usado nas opções. */
function warnObsolete(options: FluidSurfaceMaterialOptions): void {
    for (const field of ['ambient', 'reflectivity', 'shininess'] as const) {
        if (options[field] === undefined || warnedObsolete.has(field)) continue;
        warnedObsolete.add(field);
        console.warn(
            `[FluidSurfaceMaterial] '${field}' está obsoleto (spec 011): a água reflete as luzes e o hemisfério da cena com Fresnel físico${field === 'shininess' ? '; convertido em `roughness`' : ''}.`,
        );
    }
}

/**
 * Material de água (spec 017) para corpos de partículas (`FluidBody`, e também `SoftBody`): o corpo é desenhado como uma
 * superfície contínua — não como esferas — com refração do que está atrás, absorção pela espessura (Beer-Lambert), a
 * superfície como dielétrico físico (Fresnel exato pelo IOR, especular GGX com `roughness`, refletindo as luzes e o
 * hemisfério em HDR) e, sob a luz que projeta sombra, cáusticas no fundo e nos objetos submersos.
 *
 * Desenhado pelos estágios da água (`FluidFieldPassFlow`, `CausticsFlow`, `WaterFlow`); não tem shader de forward (numa
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
        warnObsolete(options);
        // `shininess` (Blinn-Phong) → rugosidade equivalente do GGX: α = √(2 / (s + 2)), rugosidade = √α.
        const roughness =
            options.roughness
            ?? (options.shininess !== undefined
                ? Math.sqrt(Math.sqrt(2 / (Math.max(options.shininess, 0) + 2)))
                : 0.02);
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
            rippleStrength: nonNegative('rippleStrength', options.rippleStrength ?? 0.3),
            rippleSize: positive('rippleSize', options.rippleSize ?? 0.06),
            rippleSpeed: nonNegative('rippleSpeed', options.rippleSpeed ?? 1),
            roughness: Math.min(nonNegative('roughness', roughness), 1),
            abbe: nonNegative('abbe', options.abbe ?? 55.7),
            _pad2: 0,
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

    /** Família de desenho: a superfície de água (spec 017), desenhada pelos estágios da água (spec 031). */
    override get family(): string {
        return 'fluid-surface';
    }

    /** Desenha corpos de partículas (a superfície de água a partir deles). */
    override get drawsParticles(): boolean {
        return true;
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
