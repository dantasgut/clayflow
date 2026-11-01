import { Entity } from '../../scene/contracts/Entity';
import { Caustics } from '../lighting/caustics/Caustics';
import {
    GI_QUALITY,
    GI_RAYS_PER_PROBE,
    GI_SCREEN_FRACTIONS,
    GI_SCREEN_RAYS,
    GI_SCREEN_TILES,
    GlobalIllumination,
    type GlobalIlluminationProfileField,
} from '../lighting/GlobalIllumination';
import { Froxels } from '../media/Froxels';
import { SHADOW_PENUMBRA_SAMPLES, type ShadowMap } from '../scene/ShadowMap';
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
    /** Traçado em xadrez (Opção B2). */
    readonly checkerboard: boolean;
    /** Quadros entre duas emissões de fótons (Opção B3). */
    readonly causticsInterval: number;
    /** Os valores da luz global (os da qualidade da GI, spec 033 R9). */
    readonly globalIllumination: Readonly<Record<GlobalIlluminationProfileField, number>>;
    /** Froxels da névoa por eixo. */
    readonly froxels: readonly [number, number, number];
    /** Lado do mapa de sombra em texels. */
    readonly shadowResolution: number;
    /** Amostras da penumbra. */
    readonly penumbraSamples: number;
}

const giOf = (q: keyof typeof GI_QUALITY): ProfileValues['globalIllumination'] => {
    const v = GI_QUALITY[q];
    return {
        raysPerProbe: v.raysPerProbe,
        probeFraction: v.probeFraction,
        screenRays: v.screenRays,
        screenTile: v.screenTile,
        screenFraction: v.screenFraction,
    };
};

/**
 * Os perfis (medidos no tanque, `baseline.md`, "Os botões de qualidade" e "Os perfis do renderizador no tanque"): o alto
 * é o padrão de antes da 039 (a mesma imagem); o médio corta o teto de interfaces e os fótons; o baixo, mais fótons. As
 * cáusticas ficam ligadas em todos. A luz global segue as qualidades dela (spec 033 R9: alto, médio e baixo); a névoa,
 * a sombra e a penumbra têm no alto os valores de antes da T079 (a mesma imagem) e, no médio e no baixo, grades menores
 * — o espaçamento das sondas do mundo fica com a cena (ele é limitado pela parede mais fina: maior, a luz vaza).
 */
export const RENDER_PROFILES: Readonly<Record<RenderProfile, ProfileValues>> = {
    high: {
        transmission: 16,
        caustics: true,
        photons: 65_536,
        checkerboard: false,
        causticsInterval: 1,
        globalIllumination: giOf('high'),
        froxels: [160, 90, 128],
        shadowResolution: 1024,
        penumbraSamples: 9,
    },
    // O xadrez no médio e no baixo: parado, 1,6 % dos pixels diferem da imagem sem ele (nas bordas), acima do limite da
    // SC-010 — aceito pelo usuário em 2026-10-31 pelos 4–5 ms.
    medium: {
        transmission: 4,
        caustics: true,
        photons: 16_384,
        checkerboard: true,
        causticsInterval: 1,
        globalIllumination: giOf('medium'),
        froxels: [128, 72, 96],
        shadowResolution: 1024,
        penumbraSamples: 4,
    },
    // Teto 4: com 3, o caminho vidro → água → vidro não fecha e a energia restante vira preto (medido no tanque). As
    // cáusticas ficam em todo perfil (decisão do usuário): o baixo só tem menos fótons.
    low: {
        transmission: 4,
        caustics: true,
        photons: 8_192,
        checkerboard: true,
        causticsInterval: 1,
        globalIllumination: giOf('low'),
        froxels: [96, 54, 64],
        shadowResolution: 512,
        penumbraSamples: 4,
    },
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
    /** A luz global ligada (a `GlobalIllumination` da cena roda; desligada aqui, não roda mesmo ligada nela). */
    globalIllumination: boolean;
}

/**
 * A luz global da cena pelo renderizador (os valores da qualidade da `GlobalIllumination`; os que a autoria fixou na
 * GI valem por cima). A densidade das sondas é a fração das do mundo atualizadas por quadro e o ladrilho das de tela.
 */
export interface GlobalIlluminationSettings {
    /** Raios por sonda do mundo: 32, 64, 128 ou 256. */
    raysPerProbe: number;
    /** Fração das sondas do mundo atualizadas por quadro, em (0, 1]. */
    probeFraction: number;
    /** Raios por sonda de tela: 4, 8, 16, 32 ou 64. */
    screenRays: number;
    /** Lado do ladrilho de uma sonda de tela em px num alvo de 1080 linhas: 4, 8 ou 16. */
    screenTile: number;
    /** Fração das sondas de tela que lançam raios por quadro: 1, 0,5 ou 0,25. */
    screenFraction: number;
}

/** A névoa (os `Froxels` da cena). */
export interface FogSettings {
    /** Froxels por eixo (x, y na tela, z em fatias da profundidade), inteiros em 1–2048. */
    resolution: readonly [number, number, number];
}

/** As sombras das luzes (os `ShadowMap`; o que a autoria fixou num mapa vale por cima). */
export interface ShadowSettings {
    /** Lado do mapa em texels, inteiro em 1–8192. */
    resolution: number;
    /** Amostras da penumbra: 1, 4 ou 9. */
    penumbraSamples: number;
}

/** O traçado: como o trabalho dos caminhos se distribui pelos quadros (spec 039, Opção B). */
export interface TracingSettings {
    /** Metade dos blocos 2×2 traçada por quadro, em xadrez (B2): parado, converge à imagem sem ele. */
    checkerboard: boolean;
}

/** O transporte das cáusticas: a luz que passa por vidro, água e metal liso até uma superfície difusa. */
export interface CausticsSettings {
    /** Ligado. */
    enabled: boolean;
    /** Fótons por quadro (≥ 0). */
    photons: number;
    /** Lado da célula do hash em m (> 0). */
    cellSize: number;
    /** Quadros entre duas emissões de fótons (≥ 1; parado, a mesma imagem; em movimento, o atraso do intervalo). */
    interval: number;
}

/**
 * Renderer — a configuração do desenho de uma cena num lugar só (spec 039, FR-010/FR-011): os caminhos de luz, as
 * cáusticas, a luz global, a névoa, as sombras (spec 034, T079), o antisserrilhado, o filtro temporal e o perfil de
 * qualidade que preenche os valores. A refração de cada
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
    /** A distribuição do traçado pelos quadros. */
    readonly tracing: TracingSettings;
    /** A luz global da cena. */
    readonly globalIllumination: GlobalIlluminationSettings;
    /** A névoa da cena. */
    readonly fog: FogSettings;
    /** As sombras da cena. */
    readonly shadows: ShadowSettings;
    /** @internal O Resource que os estágios de refração leem. */
    readonly refractionResource: Refraction;
    /** @internal O Resource que os estágios de cáusticas leem (inserido com o primeiro transmissivo). */
    readonly causticsResource: Caustics;
    #profile: RenderProfile;
    /** Os valores da luz global, da névoa e das sombras (empurrados aos recursos adotados). */
    #gi: Record<GlobalIlluminationProfileField, number> = giOf('high');
    #giOn = true;
    #froxels: readonly [number, number, number] = RENDER_PROFILES.high.froxels;
    #shadowResolution = RENDER_PROFILES.high.shadowResolution;
    #penumbraSamples = RENDER_PROFILES.high.penumbraSamples;
    /** Os recursos da cena que seguem o renderizador (os estágios padrão adotam os que entram). */
    readonly #adopted = new Set<GlobalIllumination | Froxels | ShadowMap>();

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
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- os acessores dos grupos leem o estado privado.
        const self = this;
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
            get globalIllumination() {
                return self.#giOn;
            },
            set globalIllumination(on: boolean) {
                self.#giOn = on;
                self.push();
            },
        };
        const giField = (
            k: GlobalIlluminationProfileField,
            accepted: (v: number) => boolean,
            range: string,
        ): PropertyDescriptor => ({
            enumerable: true,
            get: () => this.#gi[k],
            set: (v: number) => {
                if (!accepted(v))
                    throw new RangeError(`Renderer: globalIllumination.${k} ${v} fora de ${range}`);
                this.#gi[k] = v;
                this.push();
            },
        });
        const among = (list: readonly number[]) => (v: number) => list.includes(v);
        this.globalIllumination = Object.defineProperties({} as GlobalIlluminationSettings, {
            raysPerProbe: giField('raysPerProbe', among(GI_RAYS_PER_PROBE), '{32, 64, 128, 256}'),
            probeFraction: giField('probeFraction', (v) => v > 0 && v <= 1, '(0, 1]'),
            screenRays: giField('screenRays', among(GI_SCREEN_RAYS), '{4, 8, 16, 32, 64}'),
            screenTile: giField('screenTile', among(GI_SCREEN_TILES), '{4, 8, 16}'),
            screenFraction: giField('screenFraction', among(GI_SCREEN_FRACTIONS), '{1, 0,5, 0,25}'),
        });
        this.fog = {
            get resolution() {
                return self.#froxels;
            },
            set resolution(grid: readonly [number, number, number]) {
                if (
                    grid.length !== 3
                    || !grid.every((n) => Number.isInteger(n) && n >= 1 && n <= 2048)
                )
                    throw new RangeError(
                        `Renderer: fog.resolution [${grid.join(', ')}] fora de 1–2048 por eixo`,
                    );
                self.#froxels = [grid[0], grid[1], grid[2]];
                self.push();
            },
        };
        this.shadows = {
            get resolution() {
                return self.#shadowResolution;
            },
            set resolution(n: number) {
                if (!Number.isInteger(n) || n < 1 || n > 8192)
                    throw new RangeError(`Renderer: shadows.resolution ${n} fora de 1–8192`);
                self.#shadowResolution = n;
                self.push();
            },
            get penumbraSamples() {
                return self.#penumbraSamples;
            },
            set penumbraSamples(n: number) {
                if (!(SHADOW_PENUMBRA_SAMPLES as readonly number[]).includes(n))
                    throw new RangeError(
                        `Renderer: shadows.penumbraSamples ${n} fora de {1, 4, 9}`,
                    );
                self.#penumbraSamples = n;
                self.push();
            },
        };
        this.tracing = {
            get checkerboard() {
                return refraction.checkerboard;
            },
            set checkerboard(on: boolean) {
                refraction.checkerboard = on;
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
            get interval() {
                return caustics.interval;
            },
            set interval(n: number) {
                caustics.interval = n;
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
        this.tracing.checkerboard = values.checkerboard;
        this.caustics.interval = values.causticsInterval;
        this.#gi = { ...values.globalIllumination };
        this.#froxels = values.froxels;
        this.#shadowResolution = values.shadowResolution;
        this.#penumbraSamples = values.penumbraSamples;
        this.push();
    }

    /**
     * Passa a seguir o renderizador (spec 034, T079): a luz global, os froxels e os mapas de sombra da cena recebem os
     * valores dele agora e a cada mudança (o perfil, um ajuste). Os estágios padrão adotam os que entram na cena.
     */
    adopt(resource: GlobalIllumination | Froxels | ShadowMap): void {
        this.#adopted.add(resource);
        this.pushTo(resource);
    }

    /** Deixa de seguir (o recurso saiu da cena). */
    release(resource: GlobalIllumination | Froxels | ShadowMap): void {
        this.#adopted.delete(resource);
    }

    private push(): void {
        for (const r of this.#adopted) this.pushTo(r);
    }

    private pushTo(r: GlobalIllumination | Froxels | ShadowMap): void {
        if (r instanceof GlobalIllumination) r.fromRenderer(this.#gi, this.#giOn);
        else if (r instanceof Froxels) r.grid = this.#froxels;
        else r.fromRenderer(this.#shadowResolution, this.#penumbraSamples);
    }
}
