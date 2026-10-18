// Cenas da refração (spec 034, US1): um painel emissivo xadrez atrás de objetos de vidro, sem outras luzes nem o
// hemisfério — a radiância de cada pixel é a do painel visto pelo vidro (e pelos reflexos), o que a referência
// analítica da CPU (`refractionReference.ts`) recalcula exatamente.
import type * as Clayflow from 'clayflow';
import type { Application, MaterialFunction } from 'clayflow';

/** Painel xadrez emissivo no plano z = `PANEL_Z`, casas de `CELL` m, de frente para +z. */
export const PANEL_Z = -3;
export const CELL = 0.25;
export const PANEL_SIZE = 12;
/** Luminância das casas claras e escuras (nits). */
export const PANEL_BRIGHT = 4;
export const PANEL_DARK = 0.25;

/** Casa clara em (x, y) do painel. */
export function panelBright(x: number, y: number): boolean {
    return (Math.floor(x / CELL) + Math.floor(y / CELL)) % 2 === 0;
}

const PANEL_CODE = `let c = floor(s.world_position.x / data.cell) + floor(s.world_position.y / data.cell);
    let bright = abs(c - 2.0 * floor(c * 0.5)) < 0.5;
    return closure_emission(vec3f(1.0), select(data.dark, data.bright, bright));`;

const GLASS_CODE = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), data.rough, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, data.color, data.depth, data.abbe, data.rough),
    );`;

const THIN_CODE = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), 0.0, 0.0, vec3f(0.0)),
        closure_translucent(data.color),
    );`;

/** Parâmetros do vidro das cenas (domínio: IOR, cor e distância de absorção, número de Abbe, rugosidade). */
export interface Glass {
    readonly ior: number;
    readonly color?: readonly [number, number, number];
    readonly depth?: number;
    readonly abbe?: number;
    readonly rough?: number;
}

export function glassFunction(lib: typeof Clayflow, g: Glass): MaterialFunction {
    return new lib.MaterialFunction({
        code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n${GLASS_CODE}\n}`,
        params: { ior: 'f32', color: 'vec3f', depth: 'f32', abbe: 'f32', rough: 'f32' },
        values: {
            ior: g.ior,
            color: [...(g.color ?? [1, 1, 1])],
            depth: g.depth ?? 0,
            abbe: g.abbe ?? 0,
            rough: g.rough ?? 0,
        },
        lobes: ['specular', 'transmission'],
    });
}

export function thinWallFunction(lib: typeof Clayflow, ior: number): MaterialFunction {
    return new lib.MaterialFunction({
        code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n${THIN_CODE}\n}`,
        params: { ior: 'f32', color: 'vec3f' },
        values: { ior, color: [1, 1, 1] },
        lobes: ['specular', 'translucent'],
    });
}

/** O painel xadrez e a retirada do hemisfério (só o painel emite). */
export function panelScene(lib: typeof Clayflow, app: Application): void {
    if (app.world.entityIdOfResource(app.defaults.ambient) !== undefined)
        app.world.remove(app.defaults.ambient);
    app.world.insert(
        new lib.PlaneGeometry({ size: [PANEL_SIZE, PANEL_SIZE] })
            .add(new lib.StandardMaterial())
            .add(
                new lib.MaterialFunction({
                    code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n${PANEL_CODE}\n}`,
                    params: { cell: 'f32', bright: 'f32', dark: 'f32' },
                    values: { cell: CELL, bright: PANEL_BRIGHT, dark: PANEL_DARK },
                    lobes: ['emission'],
                }),
            )
            .add(
                new lib.Transform({
                    position: [0, 0, PANEL_Z, 1],
                    // A placa nasce em XZ com a normal em +y: 90° em torno de x leva a normal para +z.
                    rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
                }),
            ),
    );
}

/** Câmera em `z` olhando para −z (o painel ao fundo). */
export function frontCamera(
    lib: typeof Clayflow,
    app: Application,
    z: number,
    fov = Math.PI / 4,
): void {
    app.world.insert(
        new lib.Camera({ fov, near: 0.05, far: 50 }).add(
            new lib.Transform({ position: [0, 0, z, 1] }),
        ),
    );
}
