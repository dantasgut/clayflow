import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import { Light, type LightValues } from './Light';
import { rectLightContribution } from './points/lightContributions';

/** Valores de uma `RectLight`: os de uma luz, o tamanho do retângulo e o eixo da largura. */
export interface RectLightValues extends LightValues {
    /** Largura e altura do retângulo, em unidades do mundo. Padrão: 1 × 1. */
    readonly size?: readonly [number, number];
    /**
     * A direção da largura do retângulo (mundo); a parte perpendicular à direção da luz é a que vale. Padrão: o eixo
     * do mundo mais afastado da direção.
     */
    readonly right?: readonly [number, number, number];
}

type Vec3 = readonly [number, number, number];

/**
 * O referencial do retângulo: a normal unitária e o eixo da largura — `right` (ou o eixo do mundo mais afastado da
 * normal) sem a parte ao longo da normal, unitário.
 */
function rectFrame(
    direction: readonly number[],
    right: Vec3 | undefined,
): { normal: Vec3; axis: Vec3 } {
    const d: Vec3 = [direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0];
    const dl = Math.hypot(...d) || 1;
    const n: Vec3 = [d[0] / dl, d[1] / dl, d[2] / dl];
    const a = n.map(Math.abs) as [number, number, number];
    const away: Vec3 =
        a[0] <= a[1] && a[0] <= a[2] ? [1, 0, 0] : a[1] <= a[2] ? [0, 1, 0] : [0, 0, 1];
    const project = (r: Vec3): Vec3 => {
        const along = r[0] * n[0] + r[1] * n[1] + r[2] * n[2];
        return [r[0] - along * n[0], r[1] - along * n[1], r[2] - along * n[2]];
    };
    let axis = project(right ?? away);
    if (Math.hypot(...axis) < 1e-6) axis = project(away);
    const al = Math.hypot(...axis);
    return { normal: n, axis: [axis[0] / al, axis[1] / al, axis[2] / al] };
}

/**
 * Luz de área retangular (spec 011, R19): um painel emissor — a janela, o painel de estúdio. `position` é o centro,
 * `direction` a normal do lado que emite (só ele emite), `size` a largura e a altura, `right` a direção da largura; a
 * `intensity` é a luminância do painel em candela por metro quadrado (a radiância dele: a mesma em todo o painel e em
 * toda direção), vezes a cor. No desenho, cada lobo do material é integrado sobre o retângulo, por pixel e sem sorteio:
 * o realce é a imagem do painel alargada pelo lobo — a mancha larga num verniz, a mancha esticada através da escova
 * num metal escovado —, e o difuso recebe a irradiância do painel inteiro. Onde as luzes são lidas por raio ou por
 * volume (a luz rebatida, os acertos da refração e do reflexo, a névoa), o painel vale pelo centro dele: a intensidade
 * luminosa do painel visto do ponto (luminância × área × cosseno), pelo inverso do quadrado. O painel não aparece no
 * quadro nem nos reflexos traçados (é luz, não geometria). Com `castShadow: true` (spec 013) projeta sombra: a fração
 * do retângulo que cada ponto vê, por raios (o `AreaShadow` da cena; o canal dela fica em `cones.z`, 0 sem sombra —
 * acima do teto de luzes de área com sombra do perfil, o evento `shadowUnavailable`).
 */
export class RectLight extends Light {
    constructor(values: RectLightValues = {}) {
        super();
        const { normal: n, axis } = rectFrame(values.direction ?? [0, -1, 0, 0], values.right);
        const size = values.size ?? [1, 1];
        this.data = {
            kind: 3,
            castShadow: values.castShadow === true ? 1 : 0,
            intensity: values.intensity ?? 1.0,
            range: values.range ?? 0,
            position: values.position ?? [0, 2, 0, 1],
            direction: [n[0], n[1], n[2], 0],
            color: values.color ?? [1, 1, 1, 1],
            cones: [0.5 * Math.max(size[0], 0), 0.5 * Math.max(size[1], 0), 0, 0],
            axis: [axis[0], axis[1], axis[2], 0],
        };
    }

    /** A integral dos lobos sobre o retângulo no ponto `scene_direct_lighting`. */
    getSceneContributions(): readonly SceneContribution[] {
        return [rectLightContribution];
    }
}
