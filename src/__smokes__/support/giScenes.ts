// Cenas da iluminação global (spec 033, US1/US4): a mesma cena montada no motor e no traçador de caminhos da CPU (o
// gabarito dos testes) — placas (caixas finas) com material difuso puro, emissoras ou não, e o sol. A caixa de Cornell
// com um buraco no teto (o sol entra só por ele: o resto da caixa vive de luz rebatida), a mesma caixa iluminada por um
// painel emissor, a caixa sem nenhuma fonte e o ambiente branco fechado de paredes emissoras (a série analítica dos
// rebatimentos).
import {
    Application,
    BoxGeometry,
    compileSetGraph,
    graphArgument,
    GraphGeometry,
    GravityField,
    NodeGraph,
    nodes,
    ParametricSurface,
    SetGraph,
    Sky,
    SoftBody,
    SurfaceFunction,
    Camera,
    createScene,
    DirectionalLight,
    MaterialFunction,
    StandardMaterial,
    Transform,
    type AntialiasingMode,
    type DeviceOptions,
} from 'clayflow';

const aaQuery = new URLSearchParams(location.search).get('aa');
import {
    skyTableDir,
    type PtCamera,
    type PtObject,
    type PtScene,
    type PtSkyTable,
} from '../../elements/lighting/reference/pathTracer';
import {
    earthAtmosphere,
    multipleScattering,
    skyRadiance,
    sunTransmittance,
} from '../../elements/scene/reference/atmosphere';

export type Vec3 = readonly [number, number, number];

/** Placa da cena: caixa alinhada, cor difusa e o id da região. */
export interface Slab {
    readonly id: number;
    readonly min: Vec3;
    readonly max: Vec3;
    readonly color: Vec3;
    /** Radiância emitida (default nenhuma). */
    readonly emission?: Vec3;
}

/** Cena das medidas: placas, o sol (direção de propagação e iluminância) e a câmera. */
export interface GiScene {
    readonly slabs: readonly Slab[];
    /** O sol (direção de propagação e iluminância); sem ele, a cena só tem as placas emissoras. */
    readonly sun?: { readonly direction: Vec3; readonly illuminance: number };
    readonly camera: { readonly position: Vec3; readonly target: Vec3; readonly fovY: number };
    /** Regiões medidas (id → nome). */
    readonly regions: ReadonlyMap<number, string>;
    /** Centro do volume de sondas (o interior medido). */
    readonly probeCenter: Vec3;
    /** Espaçamento das sondas do mundo (m). Default 0,3. */
    readonly probeSpacing?: number;
    /** Céu físico (o `Sky` ligado ao sol; na referência, a tabela da mesma atmosfera e o sol atenuado). */
    readonly sky?: boolean;
}

/** Altitude do observador do céu físico nas cenas (km; o default do `Sky`). */
const SKY_ALTITUDE = 0.2;

const WHITE: Vec3 = [0.73, 0.73, 0.73];
const RED: Vec3 = [0.63, 0.065, 0.05];
const GREEN: Vec3 = [0.14, 0.45, 0.091];
const T = 0.15;

/** As placas da caixa de Cornell de 2 m (aberta na frente, +z) com um buraco de 0,6 m no teto. */
function cornellSlabs(): Slab[] {
    const h = 0.3;
    return [
        { id: 1, min: [-1, -T, -1], max: [1, 0, 1], color: WHITE },
        { id: 2, min: [-1, -T, -1 - T], max: [1, 2 + T, -1], color: WHITE },
        { id: 3, min: [-1 - T, -T, -1 - T], max: [-1, 2 + T, 1], color: RED },
        { id: 4, min: [1, -T, -1 - T], max: [1 + T, 2 + T, 1], color: GREEN },
        // Teto em quatro placas em volta do buraco.
        { id: 5, min: [-1, 2, -1], max: [1, 2 + T, -h], color: WHITE },
        { id: 5, min: [-1, 2, h], max: [1, 2 + T, 1], color: WHITE },
        { id: 5, min: [-1, 2, -h], max: [-h, 2 + T, h], color: WHITE },
        { id: 5, min: [h, 2, -h], max: [1, 2 + T, h], color: WHITE },
        // Dois blocos brancos fora do feixe do sol (a luz direta deles é a do mapa de sombra, exata só longe das bordas).
        { id: 6, min: [-0.8, 0, -0.75], max: [-0.35, 1.1, -0.3], color: WHITE },
        { id: 7, min: [0.4, 0, 0.2], max: [0.85, 0.55, 0.65], color: WHITE },
    ];
}

const CORNELL_CAMERA = {
    position: [0, 1, 4.2],
    target: [0, 1, 0],
    fovY: (40 * Math.PI) / 180,
} as const;

/** Caixa de Cornell com o sol a pino entrando pelo buraco do teto. */
export function cornellBox(): GiScene {
    return {
        slabs: cornellSlabs(),
        sun: { direction: [0, -1, 0], illuminance: 100 },
        camera: CORNELL_CAMERA,
        probeCenter: [0, 1, 0],
        regions: CORNELL_REGIONS,
    };
}

/** Caixa de Cornell sem sol, iluminada por um painel emissor de 0,5 m pendurado sob o teto. */
export function emissiveCornell(): GiScene {
    return {
        slabs: [
            ...cornellSlabs(),
            {
                id: 8,
                min: [-0.25, 1.9, -0.25],
                max: [0.25, 1.94, 0.25],
                color: [0, 0, 0],
                emission: [40, 38, 34],
            },
        ],
        camera: CORNELL_CAMERA,
        probeCenter: [0, 1, 0],
        regions: CORNELL_REGIONS,
    };
}

/** Caixa de Cornell sem nenhuma fonte (nem sol nem emissão): a luz rebatida não cria energia. */
export function darkCornell(): GiScene {
    return {
        slabs: cornellSlabs(),
        camera: CORNELL_CAMERA,
        probeCenter: [0, 1, 0],
        regions: CORNELL_REGIONS,
    };
}

/** Albedo e radiância emitida das paredes do ambiente branco fechado. */
export const FURNACE = { albedo: 0.5, emission: 1 } as const;

/**
 * Ambiente branco fechado (cubo de 2 m) de paredes que emitem e refletem igual: a radiância é uniforme e a luz rebatida
 * de B rebatimentos é exatamente L_e · (ρ + ρ² + … + ρ^B) — a série analítica (SC-002).
 */
export function whiteFurnace(): GiScene {
    const a = FURNACE.albedo;
    const e = FURNACE.emission;
    const box = (min: Vec3, max: Vec3): Slab => ({
        id: 1,
        min,
        max,
        color: [a, a, a],
        emission: [e, e, e],
    });
    return {
        slabs: [
            box([-1 - T, -T, -1 - T], [1 + T, 0, 1 + T]),
            box([-1 - T, 2, -1 - T], [1 + T, 2 + T, 1 + T]),
            box([-1 - T, 0, -1 - T], [-1, 2, 1 + T]),
            box([1, 0, -1 - T], [1 + T, 2, 1 + T]),
            box([-1, 0, -1 - T], [1, 2, -1]),
            box([-1, 0, 1], [1, 2, 1 + T]),
        ],
        camera: { position: [0, 1, 0.9], target: [0, 1, -1], fovY: (70 * Math.PI) / 180 },
        probeCenter: [0, 1, 0],
        regions: new Map([[1, 'paredes']]),
    };
}

/** Direção de propagação do sol com a elevação e o azimute dados (graus; azimute 0 = vindo de +x). */
export function sunFrom(elevation: number, azimuth: number): Vec3 {
    const e = (elevation * Math.PI) / 180;
    const a = (azimuth * Math.PI) / 180;
    return [-Math.cos(e) * Math.cos(a), -Math.sin(e), -Math.cos(e) * Math.sin(a)];
}

/**
 * Cômodo fechado de 4 × 2,5 × 4 m com uma janela de 1,2 × 1 m na parede +x, sob o céu físico e o sol a 35° entrando
 * pela janela (a mancha no chão): o resto do cômodo vive do céu e da luz rebatida.
 */
/** Chão aberto sob o céu físico: a luz do céu nos acertos contra a mesma atmosfera da referência. */
export function skyFloor(): GiScene {
    return {
        slabs: [{ id: 1, min: [-3, -T, -3], max: [3, 0, 3], color: [0.5, 0.5, 0.5] }],
        sun: { direction: sunFrom(35, 0), illuminance: 100000 },
        sky: true,
        camera: { position: [0, 2, 3], target: [0, 0, 0], fovY: (50 * Math.PI) / 180 },
        probeCenter: [0, 1.25, 0],
        probeSpacing: 0.33,
        regions: new Map([[1, 'chão']]),
    };
}

export function windowRoom(): GiScene {
    const wall: Vec3 = [0.75, 0.75, 0.72];
    const floor: Vec3 = [0.45, 0.4, 0.35];
    const ceil: Vec3 = [0.8, 0.8, 0.8];
    const [x0, x1, y1, z0, z1] = [-2, 2, 2.5, -2, 2];
    const [wy0, wy1, wz0, wz1] = [0.9, 1.9, -0.6, 0.6];
    return {
        slabs: [
            { id: 1, min: [x0 - T, -T, z0 - T], max: [x1 + T, 0, z1 + T], color: floor },
            { id: 2, min: [x0 - T, y1, z0 - T], max: [x1 + T, y1 + T, z1 + T], color: ceil },
            { id: 3, min: [x0, 0, z0 - T], max: [x1, y1, z0], color: wall },
            { id: 5, min: [x0 - T, 0, z0 - T], max: [x0, y1, z1 + T], color: wall },
            { id: 6, min: [x0, 0, z1], max: [x1, y1, z1 + T], color: wall },
            // A parede da janela em quatro placas em volta da abertura.
            { id: 4, min: [x1, 0, z0 - T], max: [x1 + T, wy0, z1 + T], color: wall },
            { id: 4, min: [x1, wy1, z0 - T], max: [x1 + T, y1, z1 + T], color: wall },
            { id: 4, min: [x1, wy0, z0 - T], max: [x1 + T, wy1, wz0], color: wall },
            { id: 4, min: [x1, wy0, wz1], max: [x1 + T, wy1, z1 + T], color: wall },
        ],
        sun: { direction: sunFrom(35, 0), illuminance: 100000 },
        sky: true,
        camera: {
            position: [-1.7, 1.5, 1.7],
            target: [0.6, 0.7, -0.9],
            fovY: (65 * Math.PI) / 180,
        },
        probeCenter: [0, 1.25, 0],
        probeSpacing: 0.33,
        regions: new Map([
            [1, 'chão'],
            [2, 'teto'],
            [3, 'parede do fundo'],
            [4, 'parede da janela'],
        ]),
    };
}

/**
 * Caixa fechada de 2 m com paredes finas (5 cm) sobre um chão aberto, sob o céu físico e o sol forte (vazamento,
 * SC-004): `inside` põe a câmera dentro (o interior não recebe luz nenhuma), senão fora, vendo o chão iluminado.
 */
export function closedBox(inside: boolean): GiScene {
    const w = 0.05;
    const white: Vec3 = [0.75, 0.75, 0.75];
    const box = (id: number, min: Vec3, max: Vec3): Slab => ({ id, min, max, color: white });
    return {
        slabs: [
            { id: 1, min: [-10, -0.2, -10], max: [10, 0, 10], color: [0.4, 0.38, 0.35] },
            box(2, [-1 - w, 0, -1 - w], [1 + w, w, 1 + w]),
            box(2, [-1 - w, 2, -1 - w], [1 + w, 2 + w, 1 + w]),
            box(2, [-1 - w, w, -1 - w], [-1, 2, 1 + w]),
            box(2, [1, w, -1 - w], [1 + w, 2, 1 + w]),
            box(2, [-1, w, -1 - w], [1, 2, -1]),
            box(2, [-1, w, 1], [1, 2, 1 + w]),
        ],
        sun: { direction: sunFrom(40, 30), illuminance: 100000 },
        sky: true,
        camera: inside
            ? { position: [0, 1, 0.8], target: [0, 0.9, -1], fovY: (80 * Math.PI) / 180 }
            : { position: [4, 1.6, 4.5], target: [1.5, 0, 1.5], fovY: (60 * Math.PI) / 180 },
        probeCenter: [0, 1, 0],
        regions: new Map([inside ? [2, 'interior'] : [1, 'chão de fora']]),
    };
}

const CORNELL_REGIONS: ReadonlyMap<number, string> = new Map([
    [1, 'chão'],
    [2, 'fundo'],
    [3, 'parede vermelha'],
    [4, 'parede verde'],
    [5, 'teto'],
    [6, 'bloco alto'],
    [7, 'bloco baixo'],
]);

/**
 * Função `material` difusa pura (Lambert) com a cor do material — o mesmo material do traçador de caminhos —, mais a
 * emissão dada.
 */
export function diffuseFunction(emission?: Vec3): MaterialFunction {
    const body =
        emission === undefined
            ? 'closure_diffuse(m.albedo.rgb, 0.0)'
            : `closure_add(closure_diffuse(m.albedo.rgb, 0.0), closure_emission(vec3f(${emission.map((v) => v.toFixed(6)).join(', ')}), 1.0))`;
    return new MaterialFunction({
        code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return ${body};\n}`,
        lobes: emission === undefined ? ['diffuse'] : ['diffuse', 'emission'],
    });
}

/** O que a cena montada no motor devolve: o sol (se houver) e o `Transform` da câmera. */
export interface BuiltGiScene {
    readonly sun: DirectionalLight | undefined;
    readonly view: Transform;
}

/** Monta a cena no motor (placas difusas e emissoras, o sol com sombra, a câmera). */
export function buildGiScene(
    app: Application,
    scene: GiScene,
    aspect: number,
    diffuseFn = true,
): BuiltGiScene {
    for (const s of scene.slabs) {
        const size = [0, 1, 2].map((k) => s.max[k]! - s.min[k]!);
        const center = [0, 1, 2].map((k) => (s.max[k]! + s.min[k]!) / 2);
        const e = new BoxGeometry({ size })
            .add(new StandardMaterial({ albedo: [...s.color, 1], roughness: 1 }))
            .add(new Transform({ position: [...center, 1] }));
        if (diffuseFn || s.emission !== undefined) e.add(diffuseFunction(s.emission));
        app.world.insert(e);
    }
    const sun =
        scene.sun === undefined
            ? undefined
            : new DirectionalLight({
                  direction: [...scene.sun.direction, 0],
                  intensity: scene.sun.illuminance,
                  castShadow: true,
                  shadow: { size: [2048, 2048] },
              });
    if (sun !== undefined) app.world.insert(sun);
    if (scene.sky === true && sun !== undefined)
        app.world.insert(new Sky({ sun, sunDisk: false, night: [0, 0, 0] }));
    const c = scene.camera;
    const view = new Transform({
        position: [...c.position, 1],
        rotation: Transform.lookRotation(c.position, c.target),
    });
    app.world.insert(
        new Camera({ fov: c.fovY, aspect, aspectMode: 'fixed', near: 0.05, far: 60 }).add(view),
    );
    return { sun, view };
}

/** A mesma cena para o traçador de caminhos. */
export function pathTracedScene(scene: GiScene): { scene: PtScene; camera: PtCamera } {
    const objects: PtObject[] = scene.slabs.map((s) => ({
        id: s.id,
        shape: { kind: 'box', min: s.min, max: s.max },
        material:
            s.emission === undefined
                ? { albedo: s.color }
                : { albedo: s.color, emission: s.emission },
    }));
    const sun = scene.sun;
    const direction =
        sun === undefined
            ? undefined
            : (sun.direction.map((x) => x / Math.hypot(...sun.direction)) as unknown as Vec3);
    // Com o céu físico, o sol chega atenuado pela atmosfera (a mesma transmitância do motor).
    const toSun =
        direction === undefined ? undefined : (direction.map((x) => -x) as unknown as Vec3);
    const atm = earthAtmosphere();
    const sunT: Vec3 =
        scene.sky === true && toSun !== undefined
            ? sunTransmittance(atm, SKY_ALTITUDE, toSun)
            : [1, 1, 1];
    const lights: PtScene['lights'] =
        sun === undefined || direction === undefined
            ? []
            : [
                  {
                      kind: 'directional',
                      direction,
                      illuminance: sunT.map((t) => t * sun.illuminance) as unknown as Vec3,
                  },
              ];
    const skyTable =
        scene.sky === true && toSun !== undefined ? skyTableOf(toSun, sun!.illuminance) : undefined;
    return {
        scene: { objects, lights, ...(skyTable !== undefined ? { skyTable } : {}) },
        camera: {
            position: scene.camera.position,
            target: scene.camera.target,
            fovY: scene.camera.fovY,
        },
    };
}

/** Aplicação de teste com os erros coletados. */
export async function giApp(
    width: number,
    height: number,
    errors: string[],
    device?: DeviceOptions,
): Promise<{ app: Application; canvas: HTMLCanvasElement }> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        ...(device !== undefined ? { device } : {}),
        // Antisserrilhado com que as medidas foram calibradas (MSAA, o padrão antes da 034; o temporal, padrão agora,
        // tem o smoke `antialiasing`). Diagnóstico: `?aa=off|temporal|msaa|accumulate` troca o de todas as cenas.
        antialias: (aaQuery ?? 'msaa') as AntialiasingMode,
    });
    app.events.on('engineError', (e) => errors.push(`${e.stage}: ${e.message}`));
    app.events.on('extensionRejected', (e) =>
        errors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    app.events.on('globalIlluminationUnsupported', (e) => errors.push(`unsupported: ${e.reason}`));
    return { app, canvas };
}

/**
 * Tabela do céu físico da referência (96 × 48 direções): a radiância da atmosfera de Hillaire integrada na CPU
 * (`reference/atmosphere`, a mesma que mede o céu da GPU) × a iluminância do sol; o Ψms memorizado numa grade fina.
 */
function skyTableOf(toSun: Vec3, illuminance: number): PtSkyTable {
    const atm = earthAtmosphere();
    const cache = new Map<string, readonly [number, number, number]>();
    const ms = (r: number, muS: number): readonly [number, number, number] => {
        const key = `${Math.round(r * 2)}:${Math.round(muS * 200)}`;
        let v = cache.get(key);
        if (v === undefined)
            cache.set(
                key,
                (v = multipleScattering(
                    atm,
                    Math.round(r * 2) / 2,
                    Math.round(muS * 200) / 200,
                    64,
                    32,
                )),
            );
        return v;
    };
    const table = { width: 96, height: 48, rgb: new Float32Array(96 * 48 * 3) };
    for (let j = 0; j < table.height; j++)
        for (let i = 0; i < table.width; i++) {
            const l = skyRadiance(atm, SKY_ALTITUDE, skyTableDir(table, i, j), toSun, 96, ms);
            for (let k = 0; k < 3; k++)
                table.rgb[(j * table.width + i) * 3 + k] = l[k]! * illuminance;
        }
    return table;
}

/** Palco das cenas de geometria viva (US3): chão e parede do fundo brancos, sol de lado; a câmera de frente. */
export function livingStage(): GiScene {
    const white: Vec3 = [0.75, 0.75, 0.75];
    return {
        slabs: [
            { id: 1, min: [-2.5, -T, -1.5], max: [2.5, 0, 2], color: white },
            { id: 2, min: [-2.5, 0, -1.5 - T], max: [2.5, 2, -1.5], color: white },
        ],
        sun: { direction: sunFrom(45, 180), illuminance: 100 },
        camera: { position: [0, 1.3, 3.2], target: [0, 0.5, -0.8], fovY: (55 * Math.PI) / 180 },
        probeCenter: [0, 1, -0.4],
        regions: new Map([
            [1, 'chão'],
            [2, 'parede do fundo'],
        ]),
    };
}

/**
 * Código da cortina: uma folha vertical ondulada em x = `offset`, de 1,2 m de altura, entre z = −1,2 e −0,4, com a face
 * da frente (as faces de trás não são desenhadas nem rebatem) virada para −x, o lado do sol.
 */
const CURTAIN_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(data.offset + 0.06 * sin(u * 9.0 + data.phase), v, u - 0.8);
}`;

/**
 * Cortina vermelha paramétrica escrita na GPU (spec 010) no palco: a forma vem da função (posição `offset` e fase da
 * ondulação), mudada pelos valores — a geometria muda sem nenhuma leitura de volta. Devolve a função.
 */
export function insertCurtain(app: Application, offset: number): SurfaceFunction {
    const fn = new SurfaceFunction({
        code: CURTAIN_CODE,
        params: { offset: 'f32', phase: 'f32' },
        values: { offset, phase: 0 },
    });
    app.world.insert(
        new ParametricSurface({ resolution: [48, 24], domain: [-0.4, 0.4, 0, 1.2], animated: true })
            .add(fn)
            .add(new StandardMaterial({ albedo: [0.85, 0.08, 0.06, 1], roughness: 1 }))
            .add(new Transform()),
    );
    return fn;
}

/** Pano vermelho (corpo mole XPBD, escrito na GPU) preso pelos dois cantos de trás, caindo sobre o palco em x = −0,9. */
export function insertCloth(app: Application): void {
    const side = 16;
    const spacing = 0.05;
    const position: number[] = [];
    const mass: number[] = [];
    const uvs: number[] = [];
    for (let j = 0; j < side; j++)
        for (let i = 0; i < side; i++) {
            position.push(-0.9 + (i - (side - 1) / 2) * spacing, 1.3, -1.0 + j * spacing);
            mass.push(j === 0 && (i === 0 || i === side - 1) ? 0 : 0.01);
            uvs.push(i / (side - 1), j / (side - 1));
        }
    const at = (i: number, j: number): number => j * side + i;
    const a: number[] = [];
    const b: number[] = [];
    const triangles: number[] = [];
    for (let j = 0; j < side; j++)
        for (let i = 0; i < side; i++) {
            if (i + 1 < side) {
                a.push(at(i, j));
                b.push(at(i + 1, j));
            }
            if (j + 1 < side) {
                a.push(at(i, j));
                b.push(at(i, j + 1));
            }
            if (i + 1 < side && j + 1 < side) {
                a.push(at(i, j), at(i + 1, j));
                b.push(at(i + 1, j + 1), at(i, j + 1));
                triangles.push(
                    at(i, j),
                    at(i, j + 1),
                    at(i + 1, j),
                    at(i + 1, j),
                    at(i, j + 1),
                    at(i + 1, j + 1),
                );
            }
        }
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new SoftBody({
            algorithm: 'XPBD',
            position,
            mass,
            edges: { a, b },
            surface: { triangles, uvs },
        })
            .add(new StandardMaterial({ albedo: [0.85, 0.1, 0.08, 1], roughness: 1 }))
            .add(new Transform()),
    );
}

/** Terreno verde de grafo de nós (spec 031, escrito na GPU) em x ∈ [0,3; 1,5], z ∈ [−1,2; 0]: ruído deslocando uma grade. */
export function insertGraphTerrain(app: Application): void {
    const shape = new NodeGraph({
        nodes: {
            g: nodes.set.grid.with({ resolution: [32, 32], size: [1.2, 1.2] }),
            p: graphArgument('position'),
            h: nodes.noise.gradient3.with({ scale: 3, offset: [0.4, 1.1, 0.7] }),
            d: nodes.set.displace.with({ scale: 0.12 }),
            n: nodes.set.recomputeNormals,
            o: nodes.set.meshOutput,
        },
        links: [
            ['g.mesh', 'd.mesh'],
            ['p.value', 'h.p'],
            ['h.value', 'd.height'],
            ['d.mesh', 'n.mesh'],
            ['n.mesh', 'o.mesh'],
        ],
    });
    const graph = new SetGraph({ graph: shape });
    const plan = compileSetGraph(shape, (id) => graph.valuesOf(id));
    const cap = (key: string): number => plan.sets.find((x) => x.key === key)?.capacity ?? 0;
    app.world.insert(
        graph
            .add(
                new GraphGeometry({
                    vertexCapacity: cap('n.mesh.vertices'),
                    indexCapacity: cap('n.mesh.triangles') * 3,
                }),
            )
            .add(new StandardMaterial({ albedo: [0.1, 0.7, 0.12, 1], roughness: 1 }))
            .add(new Transform({ position: [0.9, 0.12, -0.6, 1] })),
    );
}

/** Pixel (x, y) da projeção de um ponto de mundo pela câmera da cena (a mesma convenção do traçador de caminhos). */
export function projectPoint(
    scene: GiScene,
    width: number,
    height: number,
    p: Vec3,
): [number, number] {
    const c = scene.camera;
    const f = [0, 1, 2].map((k) => c.target[k]! - c.position[k]!);
    const fl = Math.hypot(...f);
    const fw = f.map((v) => v / fl);
    const r = [-fw[2]!, 0, fw[0]!];
    const rl = Math.hypot(...r);
    const rt = r.map((v) => v / rl);
    const up = [
        rt[1]! * fw[2]! - rt[2]! * fw[1]!,
        rt[2]! * fw[0]! - rt[0]! * fw[2]!,
        rt[0]! * fw[1]! - rt[1]! * fw[0]!,
    ];
    const d = [0, 1, 2].map((k) => p[k]! - c.position[k]!);
    const z = d[0]! * fw[0]! + d[1]! * fw[1]! + d[2]! * fw[2]!;
    const x = (d[0]! * rt[0]! + d[1]! * rt[1]! + d[2]! * rt[2]!) / z;
    const y = (d[0]! * up[0]! + d[1]! * up[1]! + d[2]! * up[2]!) / z;
    const tanY = Math.tan(c.fovY / 2);
    const tanX = tanY * (width / height);
    return [((x / tanX + 1) / 2) * width, ((1 - y / tanY) / 2) * height];
}
