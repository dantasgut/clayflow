// Cena de água dos smokes da superfície de fluido (spec 017): tanque com fundo quadriculado (ladrilhos claros e
// escuros: a refração e a absorção aparecem no padrão), paredes só de colisão, luz direcional com sombra, câmera e uma
// barragem de partículas. Determinística: as fixtures dependem só do código.
import {
    BoxCollider,
    BoxGeometry,
    Camera,
    DirectionalLight,
    FluidBody,
    FluidSurfaceMaterial,
    GravityField,
    ParticleMaterial,
    PlaneGeometry,
    PointSpriteMaterial,
    StandardMaterial,
    Transform,
} from 'clayflow';
import type { Application, FluidSurfaceMaterialOptions } from 'clayflow';
import { rng } from './particleScenes';

/** Meia largura interna do tanque em x e z (m). */
export const WATER_TANK: readonly [number, number] = [0.8, 0.4];
/** Espaçamento das partículas da água (m). */
export const WATER_SPACING = 0.025;

/** Opções da cena. */
export interface WaterSceneOptions {
    /** Lado da imagem (para o aspecto da câmera). */
    readonly width: number;
    readonly height: number;
    /** Partículas da barragem em x, y, z (padrão 24 × 48 × 32 = 36 864). */
    readonly dam?: readonly [number, number, number];
    /** Camada parada no fundo em vez da barragem: altura em partículas (água plana). */
    readonly layer?: number;
    /** Algoritmo do fluido. */
    readonly algorithm?: 'SPH' | 'PBF' | 'MPM';
    /** Material do corpo: água (opções) ou sprites. */
    readonly material?: FluidSurfaceMaterialOptions | 'sprites' | 'none';
    /** Caixa submersa no centro do tanque. */
    readonly box?: boolean;
    /** Fundo: quadriculado (padrão; mostra a refração) ou areia clara (mostra as cáusticas). */
    readonly floor?: 'checker' | 'sand';
    /** Direção da luz. */
    readonly light?: readonly [number, number, number];
    /** Posição e alvo da câmera. */
    readonly eye?: readonly [number, number, number];
    readonly target?: readonly [number, number, number];
    /** A câmera, já com o `Transform` que quem chama move; sem ela, uma parada em `eye` olhando `target`. */
    readonly camera?: Camera;
}

/** Monta a cena; devolve o corpo (ou `undefined` sem água). */
export function waterScene(app: Application, options: WaterSceneOptions): FluidBody | undefined {
    const world = app.world;
    const eye = options.eye ?? [0, 1.25, 1.55];
    const target = options.target ?? [0, 0.1, 0];
    world.insert(
        options.camera
            ?? new Camera({
                fov: Math.PI / 4,
                aspect: options.width / options.height,
                aspectMode: 'fixed',
                near: 0.05,
                far: 20,
            }).add(
                new Transform({
                    position: [...eye, 1],
                    rotation: Transform.lookRotation(eye, target),
                }),
            ),
    );
    const dir = options.light ?? [-0.25, -1, -0.35];
    world.insert(
        new DirectionalLight({
            direction: [...dir, 0],
            color: [1, 1, 1, 1],
            intensity: 1.2,
            castShadow: true,
        }),
    );
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    world.insert(new ParticleMaterial({ particleSpacing: WATER_SPACING }));
    floor(app, options.floor ?? 'checker');
    walls(app);
    if (options.box === true) {
        const box = new BoxGeometry({ size: [2 * BOX_HALF, 2 * BOX_HALF, 2 * BOX_HALF] });
        box.add(
            new StandardMaterial({ albedo: [0.85, 0.55, 0.2, 1], roughness: 0.6, metallic: 0 }),
        );
        box.add(new Transform({ position: [...BOX_CENTER, 1] }));
        world.insert(box);
        world.insert(
            new BoxCollider({
                halfExtents: [BOX_HALF, BOX_HALF, BOX_HALF, 0],
                center: [...BOX_CENTER, 1],
            }),
        );
    }
    if (options.material === 'none') return undefined;
    const position =
        options.layer !== undefined ? layer(options.layer, options.box === true) : dam(options.dam);
    const body = new FluidBody({ algorithm: options.algorithm ?? 'SPH', position });
    body.add(
        options.material === 'sprites'
            ? new PointSpriteMaterial({ color: [0.2, 0.5, 1, 1], radius: WATER_SPACING * 0.5 })
            : new FluidSurfaceMaterial(options.material ?? {}),
    );
    world.insert(body);
    return body;
}

/** Fundo quadriculado: ladrilhos de 10 cm claros e escuros sobre o tanque. */
function floor(app: Application, kind: 'checker' | 'sand'): void {
    const [hx, hz] = WATER_TANK;
    const tile = 0.1;
    for (let i = 0; i < Math.round((2 * hx) / tile); i++) {
        for (let k = 0; k < Math.round((2 * hz) / tile); k++) {
            const light = (i + k) % 2 === 0;
            const plane = new PlaneGeometry({ size: [tile, tile] });
            plane.add(
                new StandardMaterial({
                    albedo:
                        kind === 'sand'
                            ? light
                                ? [0.86, 0.82, 0.7, 1]
                                : [0.82, 0.78, 0.66, 1]
                            : light
                              ? [0.92, 0.92, 0.88, 1]
                              : [0.25, 0.27, 0.3, 1],
                    roughness: 0.9,
                    metallic: 0,
                }),
            );
            plane.add(
                new Transform({ position: [-hx + (i + 0.5) * tile, 0, -hz + (k + 0.5) * tile, 1] }),
            );
            app.world.insert(plane);
        }
    }
    // Chão de colisão (o topo em y = 0).
    app.world.insert(new BoxCollider({ halfExtents: [2, 0.5, 2, 0], center: [0, -0.5, 0, 1] }));
}

/** Altura da borda visível do tanque (m). */
const RIM = 0.1;

/** Paredes do tanque: colisão e uma borda baixa visível (não esconde a água). */
function walls(app: Application): void {
    const [hx, hz] = WATER_TANK;
    const t = 0.05;
    const h = 0.8;
    for (const [x, z, ex, ez] of [
        [hx + t, 0, t, hz + 2 * t],
        [-(hx + t), 0, t, hz + 2 * t],
        [0, hz + t, hx, t],
        [0, -(hz + t), hx, t],
    ] as const) {
        app.world.insert(
            new BoxCollider({ halfExtents: [ex, h, ez, 0], center: [x, h - 0.1, z, 1] }),
        );
        const rim = new BoxGeometry({ size: [2 * ex, RIM, 2 * ez] });
        rim.add(
            new StandardMaterial({ albedo: [0.55, 0.57, 0.6, 1], roughness: 0.8, metallic: 0 }),
        );
        rim.add(new Transform({ position: [x, RIM / 2, z, 1] }));
        app.world.insert(rim);
    }
}

/** Barragem encostada na parede −x (x, y, z por partícula, com jitter determinístico). */
function dam(size: readonly [number, number, number] = [24, 48, 32]): number[] {
    const [nx, ny, nz] = size;
    const [hx, hz] = WATER_TANK;
    const r = rng(17);
    const s = WATER_SPACING;
    const out: number[] = [];
    const z0 = -hz + s * 0.5 + (2 * hz - nz * s) / 2;
    for (let y = 0; y < ny; y++)
        for (let z = 0; z < nz; z++)
            for (let x = 0; x < nx; x++)
                out.push(
                    -hx + s * (x + 0.5) + (r() - 0.5) * s * 0.1,
                    s * (y + 0.5) + (r() - 0.5) * s * 0.1,
                    z0 + s * z + (r() - 0.5) * s * 0.1,
                );
    return out;
}

/** Caixa submersa: centro e meio lado (m). */
const BOX_CENTER: readonly [number, number, number] = [0.15, 0.12, 0];
const BOX_HALF = 0.12;

/** Camada no fundo cobrindo o tanque (água parada depois de assentar), fora da caixa quando há caixa. */
function layer(height: number, box: boolean): number[] {
    const [hx, hz] = WATER_TANK;
    const s = WATER_SPACING;
    const nx = Math.floor((2 * hx) / s);
    const nz = Math.floor((2 * hz) / s);
    const r = rng(23);
    const out: number[] = [];
    for (let y = 0; y < height; y++)
        for (let z = 0; z < nz; z++)
            for (let x = 0; x < nx; x++) {
                const p = [
                    -hx + s * (x + 0.5) + (r() - 0.5) * s * 0.05,
                    s * (y + 0.5),
                    -hz + s * (z + 0.5) + (r() - 0.5) * s * 0.05,
                ] as const;
                const inside = p.every((v, k) => Math.abs(v - BOX_CENTER[k]!) < BOX_HALF + s * 0.5);
                if (!box || !inside) out.push(...p);
            }
    return out;
}
