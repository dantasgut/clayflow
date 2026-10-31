import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { sceneCausticLightingPoint, sceneDirectLightingPoint } from '../../scene/points/lighting';
import { CAUSTICS_BUFFER_WORDS, CausticsSchema, CausticsWordSchema } from './schemas';
import { causticsLight, causticsRayLight } from './shaders';

/** Opções das cáusticas (`Caustics`). */
export interface CausticsOptions {
    /** Liga o transporte (padrão `true`). */
    readonly enabled?: boolean;
    /**
     * Fótons por quadro (padrão 65 536): o hash acumula entre quadros (média móvel de ~20), e a esfera de vidro da US5
     * fica com o fluxo a 0,1 % da referência, o padrão a 2,8 % e a variação entre quadros a 0,8 % em ~1,9 ms no M4
     * (262 144: 2,5 %, 0,4 %, 6,4 ms; smoke `caustics`).
     */
    readonly photons?: number;
    /** Lado da célula do hash em m (padrão 0,01): a resolução da cáustica na superfície. */
    readonly cellSize?: number;
    /**
     * Quadros entre duas emissões de fótons (padrão 1; spec 039, Opção B3): nos outros a média móvel do hash fica — a
     * imagem parada é a mesma; em movimento a cáustica acompanha com o atraso do intervalo.
     */
    readonly interval?: number;
}

/** Dado de um `Caustics`. */
export interface CausticsData {
    enabled: boolean;
    photons: number;
    cellSize: number;
    /** Quadros entre duas emissões (≥ 1). */
    interval: number;
    params: [Record<string, number[]>];
}

/**
 * Caustics — o transporte da luz pelos caminhos especulares (spec 034, T067c): a luz das fontes que passa por vidro,
 * água ou metal liso antes de chegar a uma superfície difusa. Recurso de render (como o `Refraction`), não do
 * material: o que acontece na superfície é o fechamento do grafo dela (Fresnel, IOR, Abbe, absorção). Os fótons saem das
 * luzes, atravessam as malhas e a superfície da água pelo mesmo acerto da refração e depositam a irradiância num hash em
 * mundo pela tenda 2D no plano tangente (`CausticsFlow`); o desenho a soma à luz direta e a luz das fontes que
 * atravessaria a água até o ponto deixa de chegar em linha reta (chega por eles). Inserido pelos estágios padrão quando a
 * cena tem um material transmissivo; desligado (ou removido), a água deixa a luz passar em linha reta, com Fresnel e
 * Beer–Lambert, e o vidro faz sombra.
 */
export class Caustics extends Entity<CausticsData> implements Resource {
    static readonly schema = CausticsSchema;

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: CausticsOptions = {}) {
        super();
        const photons = options.photons ?? 65_536;
        const cellSize = options.cellSize ?? 0.01;
        if (!Number.isInteger(photons) || photons < 0)
            throw new RangeError(`Caustics: photons inteiro ≥ 0 (recebeu ${photons})`);
        if (!(cellSize > 0)) throw new RangeError(`Caustics: cellSize > 0 (recebeu ${cellSize})`);
        this.data = {
            enabled: options.enabled ?? true,
            photons,
            cellSize,
            interval: options.interval ?? 1,
            params: [CausticsSchema.applyDefaults({}) as Record<string, number[]>],
        };
    }

    /** O transporte está ligado? */
    get enabled(): boolean {
        return this.rawData.enabled;
    }

    /** Liga ou desliga (a composição do desenho se refaz no envio). */
    set enabled(on: boolean) {
        if (on !== this.rawData.enabled) this.data.enabled = on;
    }

    /** Fótons por quadro. */
    get photons(): number {
        return this.rawData.photons;
    }

    /**
     * Troca os fótons por quadro; o espaço de trabalho do estágio segue nos dois sentidos (spec 039).
     * @throws RangeError fora de inteiro ≥ 0 (o valor anterior fica).
     */
    set photons(n: number) {
        if (!Number.isInteger(n) || n < 0)
            throw new RangeError(`Caustics: photons inteiro ≥ 0 (recebeu ${n})`);
        if (n !== this.rawData.photons) this.data.photons = n;
    }

    /** Lado da célula do hash (m). */
    get cellSize(): number {
        return this.rawData.cellSize;
    }

    /** @throws RangeError fora de > 0 (o valor anterior fica). */
    set cellSize(m: number) {
        if (!(m > 0)) throw new RangeError(`Caustics: cellSize > 0 (recebeu ${m})`);
        if (m !== this.rawData.cellSize) this.data.cellSize = m;
    }

    /** Quadros entre duas emissões de fótons. */
    get interval(): number {
        return this.rawData.interval;
    }

    /** @throws RangeError fora de inteiro ≥ 1 (o valor anterior fica). */
    set interval(n: number) {
        if (!Number.isInteger(n) || n < 1)
            throw new RangeError(`Caustics: interval inteiro ≥ 1 (recebeu ${n})`);
        if (n !== this.rawData.interval) this.data.interval = n;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'params', role: 'uniform', schema: Caustics.schema },
            {
                id: 'hash',
                role: 'storage-rw',
                schema: CausticsWordSchema,
                count: CAUSTICS_BUFFER_WORDS,
                upload: 'never',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** A luz das cáusticas no desenho e nos acertos dos raios e o zero na luz direta que atravessa a água — só ligado. */
    getSceneContributions(): readonly SceneContribution[] {
        return this.contributions;
    }

    private readonly contributions: readonly SceneContribution[] = [
        {
            point: sceneDirectLightingPoint,
            order: 20,
            pools: [],
            build: () => (this.rawData.enabled ? causticsLight : undefined),
        },
        {
            point: sceneCausticLightingPoint,
            order: 20,
            pools: [],
            build: () => (this.rawData.enabled ? causticsRayLight : undefined),
        },
    ];
}
