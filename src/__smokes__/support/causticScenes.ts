// Cenas de referência das cáusticas (spec 034, T067a): a luz do sol pela esfera de vidro e pela água até o chão, na
// forma do traçador da CPU (`lightTrace`). As mesmas medidas servem à comparação com o motor (T067b): a esfera da US5
// (raio 0,2 m, IOR 1,5, chão claro sob o sol a pino) nas alturas de 0,8 a 1,2 vez a distância focal e num receptor a 30°
// (SC-007), e o tanque de água (a cor da água dos smokes) parado, agitado pelas ondulações do smoke `refraction` e fundo,
// com o espalhamento de Morel.
import type {
    PtLightTraceOptions,
    PtObject,
    PtReceiver,
    PtScene,
    Vec3,
} from '../../elements/lighting/reference/pathTracer';

/** Uma cena de referência das cáusticas: a cena, o sol, o receptor e a janela dos fótons. */
export interface CausticCase {
    readonly name: string;
    readonly scene: PtScene;
    readonly light: { readonly direction: Vec3; readonly illuminance: Vec3 };
    readonly receiver: PtReceiver;
    readonly window: Omit<PtLightTraceOptions, 'photons' | 'firstPhoton'>;
    /** Irradiância do sol no receptor sem nada no caminho (a referência do "chão aceso"). */
    readonly open: number;
}

/** Raio, IOR e distância focal paraxial (do centro) da esfera de vidro da US5. */
export const CAUSTIC_SPHERE = { radius: 0.2, ior: 1.5, focal: (1.5 * 0.2) / (2 * 0.5) } as const;
/** Iluminância do sol das cenas (lux). */
export const CAUSTIC_SUN = 100;
/** A água dos smokes: a cor a 1 m (Beer–Lambert) e o IOR; o espalhamento de Morel na água pura, por canal R/G/B. */
export const CAUSTIC_WATER = {
    ior: 1.333,
    abbe: 55.7,
    color: [0.6, 0.85, 0.9] as Vec3,
    scattering: [650, 550, 450].map((l) => 0.00288 * (l / 500) ** -4.32) as unknown as Vec3,
} as const;

const DEG = Math.PI / 180;
const sun = (theta: number): CausticCase['light'] => ({
    direction: [Math.sin(theta), -Math.cos(theta), 0],
    illuminance: [CAUSTIC_SUN, CAUSTIC_SUN, CAUSTIC_SUN],
});

/** Chão claro de 4 × 4 m com o topo em y = 0 (id 0). */
const floor: PtObject = {
    id: 0,
    shape: { kind: 'box', min: [-2, -0.05, -2], max: [2, 0, 2] },
    material: { albedo: [0.8, 0.8, 0.8] },
};

/** Receptor horizontal no chão: quadrado de lado `size` centrado em (x, 0, z), `n` × `n` células. */
const onFloor = (size: number, n: number, x = 0, z = 0): PtReceiver => ({
    objectId: 0,
    corner: [x - size / 2, 0, z - size / 2],
    u: [size, 0, 0],
    v: [0, 0, size],
    nx: n,
    ny: n,
});

function sphereCase(factor: number): CausticCase {
    const { radius, ior, focal } = CAUSTIC_SPHERE;
    return {
        name: `sphere-${factor.toFixed(1)}f`,
        scene: {
            objects: [
                floor,
                {
                    id: 1,
                    shape: { kind: 'sphere', center: [0, factor * focal, 0], radius },
                    material: { albedo: [0, 0, 0], dielectric: { ior } },
                },
            ],
        },
        light: sun(0),
        receiver: onFloor(0.6, 60),
        window: { center: [0, 3, 0], halfWidth: 0.3 },
        open: CAUSTIC_SUN,
    };
}

/** A esfera no foco com o receptor inclinado 30° em torno de x, passando pelo ponto sob ela (SC-007). */
function sphereTiltedCase(): CausticCase {
    const { radius, ior, focal } = CAUSTIC_SPHERE;
    const c = Math.cos(30 * DEG);
    const s = Math.sin(30 * DEG);
    const size = 0.6;
    // O quadrilátero difuso inclinado (id 2), com o receptor no meio dele.
    const v: Vec3 = [0, s * size, c * size];
    return {
        name: 'sphere-tilted-30',
        scene: {
            // Sem o chão: o receptor inclinado desce abaixo de y = 0.
            objects: [
                {
                    id: 2,
                    shape: {
                        kind: 'quad',
                        corner: [-1, -s, -c],
                        u: [2, 0, 0],
                        v: [0, 2 * s, 2 * c],
                    },
                    material: { albedo: [0.8, 0.8, 0.8] },
                },
                {
                    id: 1,
                    shape: { kind: 'sphere', center: [0, focal, 0], radius },
                    material: { albedo: [0, 0, 0], dielectric: { ior } },
                },
            ],
        },
        light: sun(0),
        receiver: {
            objectId: 2,
            corner: [-size / 2, -v[1] / 2, -v[2] / 2],
            u: [size, 0, 0],
            v,
            nx: 60,
            ny: 60,
        },
        window: { center: [0, 3, 0], halfWidth: 0.3 },
        open: CAUSTIC_SUN * c,
    };
}

/** O tanque de água de profundidade `depth` (o fundo dentro do chão), com o relevo dado, sob o sol a `theta`. */
function waterCase(
    name: string,
    depth: number,
    theta: number,
    bump?: NonNullable<PtObject['material']['dielectric']>['bump'],
    scatter = false,
): CausticCase {
    const w = CAUSTIC_WATER;
    return {
        name,
        scene: {
            objects: [
                floor,
                {
                    id: 1,
                    shape: { kind: 'box', min: [-2, -0.01, -2], max: [2, depth, 2] },
                    material: {
                        albedo: [0, 0, 0],
                        dielectric: {
                            ior: w.ior,
                            abbe: w.abbe,
                            color: w.color,
                            depth: 1,
                            ...(bump === undefined ? {} : { bump }),
                        },
                    },
                },
            ],
            ...(scatter
                ? {
                      media: [
                          {
                              min: [-2, -0.01, -2] as Vec3,
                              max: [2, depth, 2] as Vec3,
                              scattering: w.scattering,
                              absorption: [0, 0, 0] as Vec3,
                              g: 0,
                          },
                      ],
                  }
                : {}),
        },
        light: sun(theta),
        receiver: onFloor(0.6, 60),
        window: {
            center: [-Math.sin(theta) * 4, Math.cos(theta) * 4, 0],
            halfWidth: 0.6 + depth * Math.tan(theta),
        },
        open: CAUSTIC_SUN * Math.cos(theta),
    };
}

/** As ondulações paradas do smoke `refraction` (T065b). */
const RIPPLE = {
    kind: 'ripple',
    strength: 0.3,
    size: 0.15,
    speed: 0,
    time: 0,
    up: [0, 1, 0],
} as const;

/** As cenas de referência da T067a. */
export const CAUSTIC_CASES: readonly CausticCase[] = [
    sphereCase(0.8),
    sphereCase(1),
    sphereCase(1.2),
    sphereTiltedCase(),
    waterCase('water-still', 0.3, 0),
    waterCase('water-still-30', 0.3, 30 * DEG),
    waterCase('water-ripple', 0.3, 0, RIPPLE),
    waterCase('water-ripple-30', 0.3, 30 * DEG, RIPPLE),
    waterCase('water-deep', 2, 0, undefined, true),
];
