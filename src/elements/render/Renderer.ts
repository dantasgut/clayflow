import { Entity } from '../../scene/contracts/Entity';
import { Caustics } from '../lighting/caustics/Caustics';
import { Refraction } from '../lighting/refraction/Refraction';
import { TemporalFilter } from '../lighting/temporal/TemporalFilter';
import { TemporalAntialiasing, type AntialiasingMode } from '../scene/TemporalAntialiasing';

/** Perfil de qualidade do desenho (spec 039, FR-010). */
export type RenderProfile = 'high' | 'medium' | 'low';

/** Valores que um perfil preenche. */
interface ProfileValues {
    /** Interfaces de transmissão por caminho. */
    readonly transmission: number;
    /** Cáusticas ligadas. */
    readonly caustics: boolean;
    /** Fótons por quadro. */
    readonly photons: number;
}

/**
 * Os perfis (medidos no tanque, `baseline.md`, "Os botões de qualidade" e "Os perfis do renderizador no tanque"): o alto
 * é o padrão de antes da 039 (a mesma imagem); o médio corta o teto de interfaces e os fótons; o baixo desliga também as
 * cáusticas.
 */
export const RENDER_PROFILES: Readonly<Record<RenderProfile, ProfileValues>> = {
    high: { transmission: 16, caustics: true, photons: 65_536 },
    medium: { transmission: 4, caustics: true, photons: 16_384 },
    // Teto 4: com 3, o caminho vidro → água → vidro não fecha e a energia restante vira preto (medido no tanque).
    low: { transmission: 4, caustics: false, photons: 16_384 },
};

/** Opções de um `Renderer`. */
export interface RendererOptions {
    /** Perfil inicial. Default `'high'`. */
    readonly profile?: RenderProfile;
    /** Modo do antisserrilhado. Default `'temporal'`. */
    readonly antialiasing?: AntialiasingMode;
}

/** Caminhos de luz (como o Light Paths do Cycles): os limites por caminho traçado. */
export interface LightPaths {
    /** A refração traçada ligada (os transmissivos mostram o que está atrás pelo traçado). */
    refraction: boolean;
    /** Interfaces de transmissão cruzadas por caminho, em 1–32. */
    transmission: number;
}

/** O transporte das cáusticas: a luz que passa por vidro, água e metal liso até uma superfície difusa. */
export interface CausticsSettings {
    /** Ligado. */
    enabled: boolean;
    /** Fótons por quadro (≥ 0). */
    photons: number;
    /** Lado da célula do hash em m (> 0). */
    cellSize: number;
}

/**
 * Renderer — a configuração do desenho de uma cena num lugar só (spec 039, FR-010/FR-011): os caminhos de luz, as
 * cáusticas, o antisserrilhado, o filtro temporal e o perfil de qualidade que preenche os valores. A refração de cada
 * objeto continua no material dele (o fechamento do grafo: transmissão, IOR, Abbe, absorção); aqui ficam só os limites
 * do traçado e o espaço que o desenho pode gastar.
 *
 * Uma entidade com as partes que os estágios leem pelos slots (`TemporalAntialiasing`, `TemporalFilter`, `Refraction`);
 * as `Caustics` entram na cena com o primeiro transmissivo (os estágios padrão as inserem; sem transmissivo, a luz
 * global não muda). Os estágios padrão inserem um por cena; a C4 acrescenta a saída e os alvos do quadro.
 */
export class Renderer extends Entity {
    /** Antisserrilhado da cena: o modo e a sequência das posições da amostra dentro do pixel. */
    readonly antialiasing: TemporalAntialiasing;
    /** Acumulador temporal de pixel (o filtro do sinal traçado). */
    readonly temporalFilter: TemporalFilter;
    /** Os limites dos caminhos traçados. */
    readonly lightPaths: LightPaths;
    /** O transporte das cáusticas. */
    readonly caustics: CausticsSettings;
    /** @internal O Resource que os estágios de refração leem. */
    readonly refractionResource: Refraction;
    /** @internal O Resource que os estágios de cáusticas leem (inserido com o primeiro transmissivo). */
    readonly causticsResource: Caustics;
    #profile: RenderProfile;

    constructor(options: RendererOptions = {}) {
        super();
        this.data = {};
        this.antialiasing = new TemporalAntialiasing({ mode: options.antialiasing ?? 'temporal' });
        this.temporalFilter = new TemporalFilter();
        this.refractionResource = new Refraction();
        this.causticsResource = new Caustics();
        this.add(this.antialiasing).add(this.temporalFilter).add(this.refractionResource);
        const refraction = this.refractionResource;
        const caustics = this.causticsResource;
        this.lightPaths = {
            get refraction() {
                return refraction.enabled;
            },
            set refraction(on: boolean) {
                refraction.enabled = on;
            },
            get transmission() {
                return refraction.maxInterfaces;
            },
            set transmission(n: number) {
                refraction.maxInterfaces = n;
            },
        };
        this.caustics = {
            get enabled() {
                return caustics.enabled;
            },
            set enabled(on: boolean) {
                caustics.enabled = on;
            },
            get photons() {
                return caustics.photons;
            },
            set photons(n: number) {
                caustics.photons = n;
            },
            get cellSize() {
                return caustics.cellSize;
            },
            set cellSize(m: number) {
                caustics.cellSize = m;
            },
        };
        this.#profile = options.profile ?? 'high';
        this.apply(RENDER_PROFILES[this.#profile]);
    }

    /** O perfil de qualidade. */
    get profile(): RenderProfile {
        return this.#profile;
    }

    /**
     * Troca o perfil: o quadro seguinte usa os valores dele; o espaço de trabalho dos estágios cresce ou encolhe com
     * eles (spec 039, a C2 realoca). Ajustes feitos depois (ex.: `lightPaths.transmission`) valem por cima do perfil.
     * @throws RangeError para um perfil desconhecido.
     */
    set profile(profile: RenderProfile) {
        const values = (RENDER_PROFILES as Partial<Record<string, ProfileValues>>)[profile];
        if (values === undefined)
            throw new RangeError(`Renderer: perfil desconhecido '${profile}'`);
        this.#profile = profile;
        this.apply(values);
    }

    private apply(values: ProfileValues): void {
        this.lightPaths.transmission = values.transmission;
        this.caustics.enabled = values.caustics;
        this.caustics.photons = values.photons;
    }
}
