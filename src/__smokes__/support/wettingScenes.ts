// Spec 034, T066d — Cenas do smoke `wetting` que medem a película pela imagem e pelas partículas: o rastro de uma gota
// num plano inclinado (a borda dele, vista de cima), a gota parada ou solta num plano inclinado (o ancoramento pela
// `SurfacePhysics`), a gota que desliza no chão passada à película e o pingo da água que escorre pela face de uma laje.
import {
    Application,
    Atmosphere,
    Camera,
    createScene,
    FluidBody,
    GravityField,
    ParticlePhysics,
    PlaneCollider,
    PlaneGeometry,
    PointSpriteMaterial,
    SphereCollider,
    StandardMaterial,
    SurfacePhysics,
    Transform,
} from 'clayflow/web';
import type { StagingBufferSpec, SurfacePhysicsOptions } from 'clayflow/web';
import { PBFSchema } from '../../elements/physics/bodies/schemas/PBFSchema';
import { capture, nextGpuFrame } from './extensionScenes';
import { lumaSrgb8 } from './images';
import { waterLook } from './waterScene';

/** Espaçamento das partículas das cenas (m). */
export const WET_SPACING = 0.025;

type Vec3 = [number, number, number];

const normalize = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** Plano inclinado: a normal com a descida de `slope` graus na direção horizontal de azimute `azimuth` graus. */
function inclined(slope: number, azimuth: number): { n: Vec3; down: Vec3 } {
    const a = (slope * Math.PI) / 180;
    const f = (azimuth * Math.PI) / 180;
    const h: Vec3 = [Math.cos(f), 0, Math.sin(f)];
    const n: Vec3 = [Math.sin(a) * h[0], Math.cos(a), Math.sin(a) * h[2]];
    const down = normalize(cross(cross(n, [0, -1, 0]), n));
    return { n, down };
}

/** O quatérnio que leva o eixo y à normal `n` (o plano desenhado no plano de colisão). */
function upTo(n: Vec3): [number, number, number, number] {
    const axis = cross([0, 1, 0], n);
    const s = Math.hypot(...axis);
    if (s < 1e-9) return [0, 0, 0, 1];
    const angle = Math.atan2(s, n[1]);
    const k = Math.sin(angle / 2) / s;
    return [axis[0] * k, axis[1] * k, axis[2] * k, Math.cos(angle / 2)];
}

async function open(
    width: number,
    height: number,
): Promise<{ app: Application; canvas: HTMLCanvasElement; errors: string[] }> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    const errors: string[] = [];
    app.events.on('engineError', (e) =>
        errors.push(`${e.stage}/${e.filter}: ${e.message.slice(0, 400)}`),
    );
    return { app, canvas, errors };
}

function close(app: Application, canvas: HTMLCanvasElement, errors: string[]): void {
    app.dispose();
    canvas.remove();
    if (errors.length > 0) throw new Error(`erros do motor: ${errors.join(' | ')}`);
}

/** Medidas do rastro na imagem: a serrilha das bordas, as falhas e a largura. */
export interface TrailEdge {
    /** Desvio RMS das duas bordas da reta ajustada a cada uma (mm). */
    readonly rms: number;
    /** Fração das fileiras ao longo do rastro sem água (o rastro pontilhado). */
    readonly gaps: number;
    /** Bordas por fileira, na média (2 numa faixa só; cada fileira de gotas que corre separada soma 2). */
    readonly crossings: number;
    /** Largura média (mm). */
    readonly width: number;
    /** Fileiras medidas. */
    readonly rows: number;
    /** As gotas do rastro (os componentes da máscara de ≥ 4 pixels). */
    readonly drops: number;
    /** A razão mediana dos eixos das gotas (os momentos de segunda ordem; 1 na redonda). */
    readonly roundness: number;
    /** A imagem medida. */
    readonly image?: ImageData;
}

/**
 * O rastro de uma gota (um aglomerado de 3 × 3 partículas) que escorre num azulejo inclinado 35°, com a descida a 30°
 * dos eixos da grade da película (o degrau da célula aparece na borda do rastro). Vista de cima, a luz do hemisfério
 * só (a imagem é o albedo escurecido pela película): a máscara do molhado pela metade do escurecimento, o eixo do
 * rastro pelas componentes principais dela e, ao longo dele, as duas bordas pela interpolação da luminância.
 */
export async function trailEdge(): Promise<TrailEdge> {
    const W = 384;
    const { app, canvas, errors } = await open(W, W);
    const world = app.world;
    app.defaults.ambient.background = false;
    const s = WET_SPACING;
    const { n, down } = inclined(35, 30);
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    world.insert(
        new ParticlePhysics({
            ...ParticlePhysics.WATER,
            particleSpacing: s,
            bounds: 'open',
            domainMin: [-3, -3, -3],
            domainMax: [3, 3, 3],
        }),
    );
    world.insert(new Atmosphere({ relativeHumidity: 1 }));
    world.insert(
        new PlaneCollider({ normal: [...n, 0], offset: 0 }).add(
            new SurfacePhysics(SurfacePhysics.GLAZED_TILE),
        ),
    );
    const plane = new PlaneGeometry({ size: [4, 4] });
    plane.add(new StandardMaterial({ albedo: [0.35, 0.35, 0.35, 1], roughness: 1, metallic: 0 }));
    plane.add(new Transform({ position: [0, 0, 0, 1], rotation: upTo(n) }));
    world.insert(plane);
    // A gota: 3 × 3 partículas sobre o plano, acima do centro da vista (desce por ele).
    const t1 = normalize(cross(n, down));
    const start: Vec3 = [-0.35 * down[0], -0.35 * down[1], -0.35 * down[2]];
    const position: number[] = [];
    for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
            for (let k = 0; k < 3; k++)
                position.push(start[k]! + (i * t1[k]! + j * down[k]!) * s + n[k]! * 0.5 * s);
    const body = new FluidBody({ algorithm: 'PBF', position });
    body.add(waterLook({}));
    world.insert(body);
    const eye: Vec3 = [0, 1.6, 0.001];
    world.insert(
        new Camera({ fov: Math.PI / 6, aspect: 1, aspectMode: 'fixed', near: 0.05, far: 10 }).add(
            new Transform({
                position: [...eye, 1],
                rotation: Transform.lookRotation(eye, [0, 0, 0]),
            }),
        ),
    );
    await app.whenReady({ timeoutMs: 30_000 });
    for (let i = 0; i < 150; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    // Parado: a imagem converge sem a água andar (a película não muda sem passo da simulação).
    for (let i = 0; i < 30; i++) {
        app.step(0);
        await nextGpuFrame(app);
    }
    // A captura logo depois do passo (a espera apresenta e limpa o canvas).
    app.step(0);
    const image = capture(canvas);
    close(app, canvas, errors);
    // Milímetros por pixel no centro da vista (a borda do rastro corre na horizontal do plano: sem encurtar).
    const mm = (2 * 1.6 * Math.tan(Math.PI / 12) * 1000) / W;
    return { ...measureTrail(image, mm), image };
}

/** As medidas do rastro na imagem (`trailEdge`). */
export function measureTrail(image: ImageData, mm: number): TrailEdge {
    const W = image.width;
    const H = image.height;
    const L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = lumaSrgb8(image.data, 4 * i);
    const sorted = [...L].sort((a, b) => a - b);
    const dry = sorted[Math.floor(0.9 * sorted.length)]!;
    const wet = sorted[Math.floor(0.002 * sorted.length)]!;
    const threshold = 0.5 * (dry + wet);
    // Máscara e componentes principais.
    let count = 0;
    let mx = 0;
    let my = 0;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (L[y * W + x]! < threshold) {
                count++;
                mx += x;
                my += y;
            }
    if (count < 50)
        return {
            rms: Infinity,
            gaps: 1,
            crossings: 0,
            width: 0,
            rows: 0,
            drops: 0,
            roundness: Infinity,
        };
    mx /= count;
    my /= count;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (L[y * W + x]! < threshold) {
                sxx += (x - mx) ** 2;
                sxy += (x - mx) * (y - my);
                syy += (y - my) ** 2;
            }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const u = [Math.cos(angle), Math.sin(angle)] as const;
    const v = [-u[1], u[0]] as const;
    const sample = (x: number, y: number): number => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return dry;
        const fx = x - x0;
        const fy = y - y0;
        const at = (i: number, j: number): number => L[(y0 + j) * W + x0 + i]!;
        return (
            at(0, 0) * (1 - fx) * (1 - fy)
            + at(1, 0) * fx * (1 - fy)
            + at(0, 1) * (1 - fx) * fy
            + at(1, 1) * fx * fy
        );
    };
    // Extensão ao longo do eixo.
    let tmin = Infinity;
    let tmax = -Infinity;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (L[y * W + x]! < threshold) {
                const t = (x - mx) * u[0] + (y - my) * u[1];
                tmin = Math.min(tmin, t);
                tmax = Math.max(tmax, t);
            }
    const span = tmax - tmin;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    let gaps = 0;
    let rows = 0;
    let width = 0;
    let crossings = 0;
    // O meio do rastro (10 % a 90 % do comprimento): as pontas são o começo e o fim da gota.
    for (let t = tmin + 0.1 * span; t <= tmax - 0.1 * span; t += 1) {
        rows++;
        const cx = mx + t * u[0];
        const cy = my + t * u[1];
        let first = NaN;
        let last = NaN;
        let prev = sample(cx - 60 * v[0], cy - 60 * v[1]);
        for (let q = -60 + 0.25; q <= 60; q += 0.25) {
            const val = sample(cx + q * v[0], cy + q * v[1]);
            if ((prev - threshold) * (val - threshold) < 0) {
                crossings++;
                const cross = q - 0.25 + (0.25 * (prev - threshold)) / (prev - val);
                if (Number.isNaN(first)) first = cross;
                last = cross;
            }
            prev = val;
        }
        if (Number.isNaN(first) || last - first < 1) {
            gaps++;
            continue;
        }
        left.push([t, first]);
        right.push([t, last]);
        width += last - first;
    }
    // As interrupções ao longo das linhas paralelas ao eixo.
    const residual = (pts: [number, number][]): number[] => {
        const n = pts.length;
        const st = pts.reduce((a, p) => a + p[0], 0) / n;
        const ss = pts.reduce((a, p) => a + p[1], 0) / n;
        let num = 0;
        let den = 0;
        for (const [t, e] of pts) {
            num += (t - st) * (e - ss);
            den += (t - st) ** 2;
        }
        const k = den > 0 ? num / den : 0;
        return pts.map(([t, e]) => e - (ss + k * (t - st)));
    };
    const all = [...residual(left), ...residual(right)];
    const rms = Math.sqrt(all.reduce((a, r) => a + r * r, 0) / Math.max(all.length, 1));
    // As gotas: os componentes conexos (4-vizinhança) da máscara e a razão dos eixos de cada um.
    const label = new Int32Array(W * H).fill(-1);
    const ratios: number[] = [];
    for (let i0 = 0; i0 < W * H; i0++) {
        if (label[i0] !== -1 || !(L[i0]! < threshold)) continue;
        const stack = [i0];
        label[i0] = ratios.length;
        const pts: number[] = [];
        while (stack.length > 0) {
            const i = stack.pop()!;
            pts.push(i);
            const x = i % W;
            const y = (i - x) / W;
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ] as const) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const j = ny * W + nx;
                if (label[j] !== -1 || !(L[j]! < threshold)) continue;
                label[j] = label[i0]!;
                stack.push(j);
            }
        }
        if (pts.length < 4) {
            ratios.push(NaN);
            continue;
        }
        let ax = 0;
        let ay = 0;
        for (const i of pts) {
            ax += i % W;
            ay += Math.floor(i / W);
        }
        ax /= pts.length;
        ay /= pts.length;
        let cxx = 0;
        let cxy = 0;
        let cyy = 0;
        for (const i of pts) {
            const dx = (i % W) - ax;
            const dy = Math.floor(i / W) - ay;
            cxx += dx * dx;
            cxy += dx * dy;
            cyy += dy * dy;
        }
        const tr = cxx + cyy;
        const det = Math.sqrt(Math.max(0, (cxx - cyy) ** 2 + 4 * cxy * cxy));
        const l1 = 0.5 * (tr + det);
        const l2 = Math.max(0.5 * (tr - det), 1e-9);
        ratios.push(Math.sqrt(l1 / l2));
    }
    const round = ratios.filter((r) => Number.isFinite(r)).sort((a, b) => a - b);
    return {
        rms: rms * mm,
        gaps: rows > 0 ? gaps / rows : 1,
        crossings: rows > 0 ? crossings / rows : 0,
        width: left.length > 0 ? (width / left.length) * mm : 0,
        rows,
        drops: round.length,
        roundness: round.length > 0 ? round[Math.floor(round.length / 2)]! : Infinity,
    };
}

/** Posições das partículas do pool do PBF lidas de volta (xyz por partícula). */
async function positions(app: Application): Promise<Float32Array> {
    const spec = app.resources.poolBufferSpec(PBFSchema.name);
    if (spec === undefined) throw new Error('pool do PBF inexistente');
    const count = app.resources.poolCount(PBFSchema.name);
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'wetting_positions',
        byteSize: spec.byteSize,
    });
    app.core.record('wetting-positions', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const f = new Float32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const stride = PBFSchema.stride / 4;
    const po = PBFSchema.offsetOf('pos') / 4;
    const out = new Float32Array(3 * count);
    for (let e = 0; e < count; e++)
        for (let k = 0; k < 3; k++) out[3 * e + k] = f[e * stride + po + k]!;
    return out;
}

/** O deslize de uma gota de uma partícula num plano inclinado (`dropSlide`). */
export interface DropSlide {
    /** O que ela andou ao longo da descida entre 1 e 2 s (m). */
    readonly moved: number;
}

/**
 * A gota de uma partícula (espaçamento `spacing`) pousada num plano inclinado `slope` graus, de superfície `surface`
 * (spec 034, T066d): o ancoramento dela é o da borda pela `SurfacePhysics` (`ParticlePhysics.dropPinning`). Devolve o
 * que ela andou ao longo da descida entre 1 e 2 s.
 */
export async function dropSlide(
    slope: number,
    surface: SurfacePhysicsOptions,
    spacing: number,
): Promise<DropSlide> {
    const { app, canvas, errors } = await open(64, 64);
    const world = app.world;
    const { n, down } = inclined(slope, 0);
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    world.insert(
        new ParticlePhysics({
            ...ParticlePhysics.WATER,
            particleSpacing: spacing,
            bounds: 'open',
            domainMin: [-3, -3, -3],
            domainMax: [3, 3, 3],
        }),
    );
    world.insert(
        new PlaneCollider({ normal: [...n, 0], offset: 0 }).add(new SurfacePhysics(surface)),
    );
    const body = new FluidBody({
        algorithm: 'PBF',
        position: [n[0] * 0.5 * spacing, n[1] * 0.5 * spacing, n[2] * 0.5 * spacing],
    });
    body.add(new PointSpriteMaterial({ color: [0.2, 0.5, 1, 1], radius: 0.5 * spacing }));
    world.insert(body);
    world.insert(
        new Camera({ fov: Math.PI / 4, aspect: 1, aspectMode: 'fixed', near: 0.05, far: 10 }).add(
            new Transform({
                position: [0, 1, 1, 1],
                rotation: Transform.lookRotation([0, 1, 1], [0, 0, 0]),
            }),
        ),
    );
    await app.whenReady({ timeoutMs: 30_000 });
    let at1: Float32Array | undefined;
    for (let i = 1; i <= 120; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
        if (i === 60) at1 = await positions(app);
    }
    const at2 = await positions(app);
    close(app, canvas, errors);
    const d = [at2[0]! - at1![0]!, at2[1]! - at1![1]!, at2[2]! - at1![2]!];
    return { moved: d[0]! * down[0] + d[1]! * down[1] + d[2]! * down[2] };
}

/** A gota que desliza no chão passada à película (`dropSpread`). */
export interface DropSpread {
    /** A partícula foi retirada do corpo (a película a recebeu). */
    readonly retired: boolean;
    /** O volume de uma partícula (m³). */
    readonly volume: number;
    /** Onde ela passou à película (x, z; m). */
    readonly landing: [number, number];
}

/**
 * A gota de uma partícula de 1 cm (1 mL) lançada rente a um chão horizontal de superfície `surface` a 0,5 m/s (spec
 * 034, T066d): solta e deslizando, o ancoramento não a para — o campo dos fluidos a passa à película, na poça em que ela
 * se abre. A superfície sem poros: a água só muda de lugar e evapora (`humidity`: a umidade do ar; 1, saturado, sem
 * evaporação). Lê a película (`readFilm`) aos `at` segundos.
 */
export async function dropSpread<T>(
    surface: SurfacePhysicsOptions,
    readFilm: (app: Application) => Promise<T>,
    at: readonly number[],
    humidity = 1,
): Promise<DropSpread & { film: T[] }> {
    const { app, canvas, errors } = await open(64, 64);
    const world = app.world;
    const s = 0.01;
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    const physics = new ParticlePhysics({
        ...ParticlePhysics.WATER,
        particleSpacing: s,
        bounds: 'open',
        domainMin: [-1, -1, -1],
        domainMax: [1, 1, 1],
    });
    world.insert(physics);
    world.insert(new Atmosphere({ relativeHumidity: humidity }));
    world.insert(
        new PlaneCollider({ normal: [0, 1, 0, 0], offset: 0 }).add(new SurfacePhysics(surface)),
    );
    const body = new FluidBody({
        algorithm: 'PBF',
        position: [0.0123, 0.5 * s, -0.0071],
        velocity: [0.4, 0, 0.3],
    });
    body.add(waterLook({}));
    world.insert(body);
    world.insert(
        new Camera({ fov: Math.PI / 4, aspect: 1, aspectMode: 'fixed', near: 0.05, far: 10 }).add(
            new Transform({
                position: [0, 1, 1, 1],
                rotation: Transform.lookRotation([0, 1, 1], [0, 0, 0]),
            }),
        ),
    );
    await app.whenReady({ timeoutMs: 30_000 });
    let retired = false;
    let landing: [number, number] = [NaN, NaN];
    const film: T[] = [];
    const last = Math.max(...at);
    for (let i = 1; i <= 60 * last; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
        if (!retired) {
            // A retirada guarda o x e o z de onde passou à película.
            const now = await positions(app);
            if (now[1]! < -1e6) {
                retired = true;
                landing = [now[0]!, now[2]!];
            }
        }
        if (at.includes(i / 60)) film.push(await readFilm(app));
    }
    close(app, canvas, errors);
    return { retired, volume: physics.particleMass / physics.restDensity, landing, film };
}

/**
 * A gota de uma partícula de 1 cm (1 mL) encostada numa parede vertical de superfície `surface` (spec 034, T066d): a
 * gravidade vence o ancoramento, ela desliza e passa à película, que escorre pela parede deixando atrás a espessura que
 * a borda segura. Ar saturado (sem evaporação). Lê a película (`readFilm`) aos `seconds` segundos.
 */
export async function wallTrail<T>(
    surface: SurfacePhysicsOptions,
    readFilm: (app: Application) => Promise<T>,
    seconds = 1,
): Promise<T> {
    const { app, canvas, errors } = await open(64, 64);
    const world = app.world;
    const s = 0.01;
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    world.insert(
        new ParticlePhysics({
            ...ParticlePhysics.WATER,
            particleSpacing: s,
            bounds: 'open',
            domainMin: [-1, -1, -1],
            domainMax: [1, 1, 1],
        }),
    );
    world.insert(new Atmosphere({ relativeHumidity: 1 }));
    world.insert(
        new PlaneCollider({ normal: [1, 0, 0, 0], offset: 0 }).add(new SurfacePhysics(surface)),
    );
    const body = new FluidBody({ algorithm: 'PBF', position: [0.5 * s, 0.4, 0.0037] });
    body.add(waterLook({}));
    world.insert(body);
    world.insert(
        new Camera({ fov: Math.PI / 4, aspect: 1, aspectMode: 'fixed', near: 0.05, far: 10 }).add(
            new Transform({
                position: [1, 0.3, 0, 1],
                rotation: Transform.lookRotation([1, 0.3, 0], [0, 0.3, 0]),
            }),
        ),
    );
    await app.whenReady({ timeoutMs: 30_000 });
    for (let i = 1; i <= 60 * seconds; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    const film = await readFilm(app);
    close(app, canvas, errors);
    return film;
}

/** O pingo da película que escorre pela esfera (`sphereDrips`). */
export interface SphereDrips {
    /** Partículas que voltaram da película (as retiradas que reapareceram junto da esfera) entre os dois instantes. */
    readonly drips: number;
    /** A água da película na esfera (livre e pendente, m³) nos dois instantes. */
    readonly before: number;
    readonly after: number;
    /** O volume de uma partícula (m³). */
    readonly volume: number;
    /** Partículas-quadro encostadas na esfera no intervalo (a deposição somaria água à película). */
    readonly touching: number;
    /** Gotas que deslizavam na esfera passadas à película no intervalo (retiradas junto dela). */
    readonly absorbed: number;
    /** A altura mínima e máxima (m) e o afastamento horizontal máximo do eixo da esfera (m) onde os pingos apareceram. */
    readonly lowest: number;
    readonly highest: number;
    readonly aside: number;
}

/** Centro e raio da esfera da cena do pingo (m). */
export const DRIP_SPHERE = { center: [0, 0.5, 0] as Vec3, radius: 0.1 };

/**
 * A água que escorre por uma esfera lisa (spec 034, T066d): um bloco de água cai sobre a esfera (raio 0,1 m, centro a
 * 0,5 m) no domínio aberto — o que cai sai por baixo do domínio e é retirado. A película que fica escorre pela esfera e,
 * na face de baixo (o sólido não segura a água contra o peso), pende, junta-se no ponto mais baixo e pinga: a película
 * junta o volume de uma partícula e devolve uma das retiradas. A superfície sem histerese (a borda não segura nada) e
 * impermeável, o ar saturado (sem evaporação): a água da película na esfera só sai pelos pingos. Lê a película
 * (`readFilm`) aos `from` e aos `to` segundos e as partículas a cada quadro entre eles.
 */
export async function sphereDrips(
    readFilm: (app: Application) => Promise<{ volume: number }>,
    from = 2,
    to = 8,
): Promise<SphereDrips> {
    const { app, canvas, errors } = await open(64, 64);
    const world = app.world;
    const s = 0.01;
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    const physics = new ParticlePhysics({
        ...ParticlePhysics.WATER,
        particleSpacing: s,
        bounds: 'open',
        domainMin: [-1, 0, -1],
        domainMax: [1, 2, 1],
    });
    world.insert(physics);
    world.insert(new Atmosphere({ relativeHumidity: 1 }));
    const { center, radius } = DRIP_SPHERE;
    world.insert(
        new SphereCollider({ radius, center: [...center, 1] }).add(
            new SurfacePhysics({ roughness: 1, hysteresis: 0 }),
        ),
    );
    const position: number[] = [];
    for (let y = 0; y < 6; y++)
        for (let z = 0; z < 12; z++)
            for (let x = 0; x < 12; x++)
                position.push(-0.06 + s * (x + 0.5), 0.62 + s * (y + 0.5), -0.06 + s * (z + 0.5));
    const body = new FluidBody({ algorithm: 'PBF', position });
    // A água desenhada pelo campo dos fluidos (é ele que guarda a película).
    body.add(waterLook({}));
    world.insert(body);
    world.insert(
        new Camera({ fov: Math.PI / 4, aspect: 1, aspectMode: 'fixed', near: 0.05, far: 10 }).add(
            new Transform({
                position: [0, 1, 1.5, 1],
                rotation: Transform.lookRotation([0, 1, 1.5], [0, 0.5, 0]),
            }),
        ),
    );
    await app.whenReady({ timeoutMs: 30_000 });
    let before = 0;
    let previous: Float32Array | undefined;
    let drips = 0;
    let touching = 0;
    let absorbed = 0;
    let lowest = Infinity;
    let highest = -Infinity;
    let aside = 0;
    const reach = 0.5 * s + 0.01;
    for (let i = 1; i <= 60 * to; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
        if (i < 60 * from) continue;
        if (i === 60 * from) before = (await readFilm(app)).volume;
        const now = await positions(app);
        for (let e = 0; e < now.length / 3; e++) {
            const p: Vec3 = [now[3 * e]!, now[3 * e + 1]!, now[3 * e + 2]!];
            if (p[1] < -1e6) {
                // A que estava encostada na esfera e foi retirada passou à película (a que sai do domínio cai por baixo).
                if (previous !== undefined && previous[3 * e + 1]! > -1e6) {
                    const q: Vec3 = [previous[3 * e]!, previous[3 * e + 1]!, previous[3 * e + 2]!];
                    const was =
                        Math.hypot(q[0] - center[0], q[1] - center[1], q[2] - center[2]) - radius;
                    if (was < reach) absorbed++;
                }
                continue;
            }
            const d = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - radius;
            if (d < reach) touching++;
            // O pingo: a retirada que reaparece — ou a que caiu do domínio e voltou no mesmo quadro (a junção a lista
            // depois do passo que a retirou): o salto para cima, para junto da esfera.
            const jumped =
                previous !== undefined
                && (previous[3 * e + 1]! < -1e6 || p[1] > previous[3 * e + 1]! + 0.05);
            if (jumped) {
                drips++;
                lowest = Math.min(lowest, p[1]);
                highest = Math.max(highest, p[1]);
                aside = Math.max(aside, Math.hypot(p[0] - center[0], p[2] - center[2]));
            }
        }
        previous = now;
    }
    const after = (await readFilm(app)).volume;
    close(app, canvas, errors);
    return {
        drips,
        before,
        after,
        volume: physics.particleMass / physics.restDensity,
        touching,
        absorbed,
        lowest,
        highest,
        aside,
    };
}
