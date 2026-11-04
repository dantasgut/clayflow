// Spec 034 — Smoke das cáusticas unificadas (T067): a luz do sol pela esfera de vidro e pela água até o chão.
//
// Casos (`case=`):
//   - reference (T067a): a referência da CPU pelo traçado a partir da luz (`lightTrace`; gerada offline por
//     `npm run caustics:reference` e gravada em `fixtures/caustics-reference.{json,bin}`, sem perfil de GPU), conferida
//     contra o que se sabe dela: a água parada a 0° e a 30° com a irradiância de Fresnel, Snell e Beer–Lambert por canal
//     a 1 %; a esfera no foco com o máximo no eixo, mais de 20× o chão aceso; a água funda (2 m, espalhamento de Morel)
//     entre o que passa direto e o que passaria sem espalhar; e o ruído da própria referência (a diferença das duas
//     metades) ≤ 1 % por célula na esfera e ≤ 2 % na água. Grava mapas de calor de cada caso (`zz-caustics-*.png`,
//     fora do commit) para ver.
//   - engine (T067c): o transporte do motor (`Caustics`) na esfera de vidro a `factor` vezes a distância focal
//     (`factor=0.8|1|1.2`, uma por execução; `cell=` o lado da célula fina do hash, padrão 5 mm; `photons=`, padrão 1 048 576),
//     lido do hash como o motor o lê (`support/causticsHash.ts`) e somado à luz direta fora da sombra da esfera, contra a referência na grade dela (1 cm): o fluxo
//     dentro da sombra a ≤ 5 % (SC-007), no receptor a ≤ 2 %, o erro do padrão (L1 relativo dentro da sombra) ≤ 10 %; e
//     mede o pico, a variação entre quadros e o custo dos fótons (relógio de parede de 60 quadros ligado e desligado).
//     Na T067b (com os fótons ainda na GI): fluxo na sombra a 52 %, pico à metade, padrão a 48 % (`research.md` R14).
//     Com `tilt=30` (T057, SC-007): a esfera no foco sobre o receptor inclinado 30° em torno de x pelo ponto sob ela
//     (`sphere-tilted-30` da referência), lido pela tenda 2D do motor (a camada pelo eixo dominante da normal muda
//     ao longo do plano), com as mesmas portas.
//   - water (T067c): o fundo da camada parada a 0° e a 30° — a linha reta mais a correção dos fótons — contra Fresnel,
//     Snell e Beer–Lambert por canal a ≤ 3 %.
//   - shadow (T067c): a sombra da parede no fundo da camada parada com o sol a 60° — a borda na posição da refração
//     (≤ 1,5 cm), não na da linha reta, a faixa entre as duas acesa e a sombra escura (≤ 5 % do nível aceso).
//   - ripple (T067c item 2; SC-017 `caustics-smooth` e `caustics-temporal`): a água agitada contra a referência
//     `water-ripple` (`angle=0|30`) — fluxo, padrão, contraste, platôs e variação entre quadros (`caseRipple`).
//
// Para rodar: `npm run smoke -- caustics [--query case=reference]`. Resultado: `CAUSTICS SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type StagingBufferSpec,
} from 'clayflow/web';
import { CAUSTIC_CASES, CAUSTIC_SPHERE, CAUSTIC_SUN, CAUSTIC_WATER } from './support/causticScenes';
import { settle } from './support/extensionScenes';
import { readFixture, readJsonFixture, writeFixture } from './support/fixtures';
import { buildGiScene, diffuseFunction, giApp } from './support/giScenes';
import { waterLook, waterScene, WATER_SPACING, WATER_TANK } from './support/waterScene';
import { closureFn } from './support/materialScenes';
import { readCausticsHash, type CausticsHash } from './support/causticsHash';

function log(msg: string): void {
    console.log(`[caustics] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

interface ReferenceEntry {
    readonly name: string;
    readonly nx: number;
    readonly ny: number;
    readonly open: number;
    readonly strata: number;
    readonly noise: readonly [number, number, number];
    readonly offset: number;
}

/** Fresnel não polarizado da interface ar → n no ângulo `i`. */
function fresnel(i: number, n: number): number {
    if (i === 0) return ((1 - n) / (1 + n)) ** 2;
    const t = Math.asin(Math.sin(i) / n);
    return (
        0.5 * ((Math.sin(i - t) / Math.sin(i + t)) ** 2 + (Math.tan(i - t) / Math.tan(i + t)) ** 2)
    );
}

/** Mapa de calor (luminância relativa ao chão aceso, escala log de 0 a 100×) em PNG. */
async function heatmap(
    rgb: Float32Array,
    nx: number,
    ny: number,
    open: number,
): Promise<Uint8Array> {
    const canvas = new OffscreenCanvas(nx, ny);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(nx, ny);
    for (let i = 0; i < nx * ny; i++) {
        for (let c = 0; c < 3; c++) {
            const v = Math.log10(1 + (9 * rgb[i * 3 + c]!) / open) / 2;
            img.data[i * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, v)));
        }
        img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
}

async function caseReference(): Promise<void> {
    const manifest = await readJsonFixture<{ cases: ReferenceEntry[] }>('caustics-reference.json');
    const bytes = await readFixture('caustics-reference.bin');
    if (manifest === null || bytes === null) {
        failures.push('reference: sem a fixture (rode `npm run caustics:reference`)');
        return;
    }
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const byName = new Map(manifest.cases.map((e) => [e.name, e]));
    const mapOf = (name: string): { e: ReferenceEntry; rgb: Float32Array } => {
        const e = byName.get(name)!;
        return { e, rgb: all.subarray(e.offset, e.offset + e.nx * e.ny * 3) };
    };
    for (const c of CAUSTIC_CASES) {
        const entry = byName.get(c.name);
        check(entry !== undefined, `reference: ${c.name} fora da fixture`);
        if (entry === undefined) continue;
        const { rgb } = mapOf(c.name);
        await writeFixture(
            `zz-caustics-${c.name}.png`,
            await heatmap(rgb, entry.nx, entry.ny, entry.open),
        );
        const limit = c.name.startsWith('sphere') ? 0.01 : 0.02;
        const worst = Math.max(...entry.noise);
        log(
            `reference: ${c.name} — ${entry.strata} estratos, ruído por célula ${entry.noise.map((x) => (100 * x).toFixed(2)).join('/')} % (≤ ${100 * limit} %)`,
        );
        check(
            worst <= limit,
            `reference: ${c.name} com ruído ${(100 * worst).toFixed(2)} % > ${100 * limit} %`,
        );
    }
    const meanOf = (rgb: Float32Array, k: number): number => {
        let s = 0;
        for (let i = k; i < rgb.length; i += 3) s += rgb[i]!;
        return s / (rgb.length / 3);
    };
    // A água parada: o fundo recebe E cos θ (1 − R) exp(−σ h / cos θ_t) (o IOR da linha d; a dispersão mexe < 0,1 %).
    for (const [name, deg] of [
        ['water-still', 0],
        ['water-still-30', 30],
    ] as const) {
        const { e, rgb } = mapOf(name);
        const theta = (deg * Math.PI) / 180;
        const thetaT = Math.asin(Math.sin(theta) / CAUSTIC_WATER.ior);
        const t = 1 - fresnel(theta, CAUSTIC_WATER.ior);
        for (let k = 0; k < 3; k++) {
            const want =
                e.open * t * Math.exp((Math.log(CAUSTIC_WATER.color[k]!) * 0.3) / Math.cos(thetaT));
            const got = meanOf(rgb, k);
            log(
                `reference: ${name} canal ${k} — ${got.toFixed(3)} lx contra ${want.toFixed(3)} (${((100 * (got - want)) / want).toFixed(2)} %)`,
            );
            check(
                Math.abs(got - want) / want <= 0.01,
                `reference: ${name} canal ${k} a ${((100 * (got - want)) / want).toFixed(2)} %`,
            );
        }
    }
    // A esfera no foco: o máximo no eixo (a célula do meio), mais de 20× o chão aceso.
    {
        const { e, rgb } = mapOf('sphere-1.0f');
        let peak = 0;
        let at = -1;
        for (let i = 0; i < e.nx * e.ny; i++) {
            const l = rgb[i * 3 + 1]!;
            if (l > peak) [peak, at] = [l, i];
        }
        const x = at % e.nx;
        const y = Math.floor(at / e.nx);
        log(
            `reference: sphere-1.0f — máximo ${(peak / e.open).toFixed(1)}× o chão aceso na célula (${x}, ${y})`,
        );
        check(
            Math.abs(x - e.nx / 2) <= 1 && Math.abs(y - e.ny / 2) <= 1,
            `reference: o foco fora do eixo (${x}, ${y})`,
        );
        check(
            peak > 20 * e.open,
            `reference: o foco a ${(peak / e.open).toFixed(1)}× o chão aceso`,
        );
    }
    // A água funda: entre o que atravessa sem espalhar e o que atravessaria só com a absorção.
    {
        const { e, rgb } = mapOf('water-deep');
        const t = 1 - fresnel(0, CAUSTIC_WATER.ior);
        for (let k = 0; k < 3; k++) {
            const absorb = Math.log(CAUSTIC_WATER.color[k]!) * 2;
            const direct = e.open * t * Math.exp(absorb - CAUSTIC_WATER.scattering[k]! * 2);
            const clear = e.open * t * Math.exp(absorb);
            const got = meanOf(rgb, k);
            log(
                `reference: water-deep canal ${k} — ${got.toFixed(3)} lx entre ${direct.toFixed(3)} e ${clear.toFixed(3)}`,
            );
            check(
                got >= direct * 0.995 && got <= clear * 1.005,
                `reference: water-deep canal ${k} fora de [${direct}, ${clear}] (${got})`,
            );
        }
    }
}

/** O vidro das cenas (IOR pela função `material`). */
const GLASS = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), 0.0, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, vec3f(1.0), 0.0, 0.0, 0.0),
    );`;

/**
 * A irradiância no chão (y = 0) na grade da referência (`n` × `n` células de lado `size`): a cáustica como o motor a lê
 * (`readCausticsHash`, a média de 4 × 4 pontos na célula da grade) mais a luz direta do sol fora da sombra geométrica
 * da esfera (a fração da célula fora do disco de raio R, por 10 × 10 subamostras).
 */
function engineGrid(hash: CausticsHash, size: number, n: number): Float32Array {
    const out = new Float32Array(n * n * 3);
    const cell = size / n;
    const sub = 4;
    const r = CAUSTIC_SPHERE.radius;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
            const x0 = -size / 2 + i * cell;
            const z0 = -size / 2 + j * cell;
            const e = [0, 0, 0];
            for (let b = 0; b < sub; b++)
                for (let a = 0; a < sub; a++) {
                    const v = hash.irradiance(
                        [x0 + ((a + 0.5) / sub) * cell, 0, z0 + ((b + 0.5) / sub) * cell],
                        [0, 1, 0],
                    );
                    for (let k = 0; k < 3; k++) e[k]! += v[k]! / (sub * sub);
                }
            let lit = 0;
            for (let b = 0; b < 10; b++)
                for (let a = 0; a < 10; a++) {
                    const x = x0 + ((a + 0.5) / 10) * cell;
                    const z = z0 + ((b + 0.5) / 10) * cell;
                    if (x * x + z * z >= r * r) lit++;
                }
            for (let k = 0; k < 3; k++)
                out[(j * n + i) * 3 + k] = e[k]! + (CAUSTIC_SUN * lit) / 100;
        }
    return out;
}

/** Inclinação do receptor do caso `tilt` (graus, em torno de x) e o lado dele (m). */
const TILT = 30;
const TILT_SIZE = 0.6;

/** O ponto do receptor inclinado nas frações (`a`, `b`) dos eixos u (x) e v (subindo para +z) — o da referência. */
function tiltedPoint(a: number, b: number): [number, number, number] {
    const c = Math.cos((TILT * Math.PI) / 180);
    const s = Math.sin((TILT * Math.PI) / 180);
    const t = (b - 0.5) * TILT_SIZE;
    return [(a - 0.5) * TILT_SIZE, s * t, c * t];
}

/**
 * A irradiância no receptor inclinado na grade da referência (`n` × `n`), por 4 × 4 subamostras: a luz direta do sol a
 * pino (`open`, já com o cosseno) fora da sombra da esfera (x² + z² ≥ R²) mais a cáustica como o motor a lê (a normal
 * do receptor, (0, cos, −sen)).
 */
function engineGridTilted(hash: CausticsHash, n: number, open: number): Float32Array {
    const out = new Float32Array(n * n * 3);
    const r = CAUSTIC_SPHERE.radius;
    const sub = 4;
    const normal = [
        0,
        Math.cos((TILT * Math.PI) / 180),
        -Math.sin((TILT * Math.PI) / 180),
    ] as const;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
            const e = [0, 0, 0];
            let lit = 0;
            for (let b = 0; b < sub; b++)
                for (let a = 0; a < sub; a++) {
                    const p = tiltedPoint((i + (a + 0.5) / sub) / n, (j + (b + 0.5) / sub) / n);
                    if (p[0] * p[0] + p[2] * p[2] >= r * r) lit++;
                    const v = hash.irradiance(p, normal);
                    for (let q = 0; q < 3; q++) e[q]! += v[q]! / (sub * sub);
                }
            for (let q = 0; q < 3; q++)
                out[(j * n + i) * 3 + q] = e[q]! + (open * lit) / (sub * sub);
        }
    return out;
}

async function caseEngine(): Promise<void> {
    const query = new URLSearchParams(location.search);
    const tilted = query.get('tilt') !== null;
    const factor = tilted ? 1 : Number(query.get('factor') ?? '1');
    const cellSize = Number(query.get('cell') ?? '0.005');
    const photons = Number(query.get('photons') ?? '1048576');
    const name = tilted ? `sphere-tilted-${TILT}` : `sphere-${factor.toFixed(1)}f`;
    const manifest = await readJsonFixture<{ cases: ReferenceEntry[] }>('caustics-reference.json');
    const bytes = await readFixture('caustics-reference.bin');
    const entry = manifest?.cases.find((e) => e.name === name);
    if (entry === undefined || bytes === null) {
        failures.push(`engine: sem a referência de ${name}`);
        return;
    }
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const ref = all.subarray(entry.offset, entry.offset + entry.nx * entry.ny * 3);
    const errors: string[] = [];
    const { app, canvas } = await giApp(320, 200, errors);
    // O transporte antes do vidro, pelo renderizador (os estágios padrão o inseririam com o vidro).
    const renderer = app.defaults.renderer;
    renderer.caustics.cellSize = cellSize;
    renderer.caustics.photons = photons;
    const caustics = renderer.causticsResource;
    app.world.insert(caustics);
    if (tilted) {
        // O quadrilátero difuso da referência: uma placa de 2 × 2 m com o topo pelo ponto sob a esfera, girada em x.
        const half = (-TILT * Math.PI) / 360;
        const c = Math.cos((TILT * Math.PI) / 180);
        const s = Math.sin((TILT * Math.PI) / 180);
        app.world.insert(
            new BoxGeometry({ size: [2, 0.05, 2] })
                .add(new StandardMaterial({ albedo: [0.8, 0.8, 0.8, 1], roughness: 1 }))
                .add(diffuseFunction())
                .add(
                    new Transform({
                        position: [0, -0.025 * c, 0.025 * s, 1],
                        rotation: [Math.sin(half), 0, 0, Math.cos(half)],
                    }),
                ),
        );
    }
    buildGiScene(
        app,
        {
            slabs: tilted
                ? []
                : [{ id: 1, min: [-2, -0.05, -2], max: [2, 0, 2], color: [0.8, 0.8, 0.8] }],
            sun: { direction: [0, -1, 0], illuminance: CAUSTIC_SUN },
            camera: { position: [0, 0.12, 1.6], target: [0, 0.01, 0], fovY: Math.PI / 5 },
            probeCenter: [0, 0.5, 0],
            regions: new Map([[1, 'chão']]),
        },
        320 / 200,
    );
    const { radius, ior, focal } = CAUSTIC_SPHERE;
    app.world.insert(
        new SphereGeometry({
            radius,
            latSegments: Number(query.get('lat') ?? '96'),
            lonSegments: 2 * Number(query.get('lat') ?? '96'),
        })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, factor * focal, 0, 1] }))
            .add(closureFn(GLASS, ['specular', 'transmission'], { ior: 'f32' }, { ior })),
    );
    await settle(app, 4000);
    const step = async (frames: number): Promise<void> => {
        for (let i = 0; i < frames; i++) {
            app.step(1 / 60);
            if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
        }
    };
    await step(150);
    const raw = await readCausticsHash(app, caustics);
    {
        // Diagnóstico: o fluxo de todo o hash por nível e por distância do eixo (irradiância × área da célula) contra o
        // que entra na esfera.
        const into = CAUSTIC_SUN * Math.PI * radius * radius;
        const levels = new Map<number, number>();
        const far = [0.3, 0.5, 1, 1.5, 2, 3];
        const farAcc = far.map(() => 0);
        for (const b of raw.buckets) {
            const f = b.rgb[1] * b.size * b.size;
            levels.set(b.level, (levels.get(b.level) ?? 0) + f);
            const at = far.findIndex((q) => Math.hypot(b.center[0], b.center[2]) < q);
            if (at >= 0) farAcc[at]! += f;
        }
        log(
            `engine ${name}: fluxo do hash por distância do eixo (× o que entra): ${far.map((q, k) => `<${q}: ${(farAcc[k]! / into).toFixed(3)}`).join('  ')}`,
        );
        log(
            `engine ${name} (célula fina de ${(1000 * cellSize).toFixed(1)} mm): ${raw.buckets.length} células; fluxo por nível ${[
                ...levels.entries(),
            ]
                .sort((p, q) => p[0] - q[0])
                .map(([l, f]) => `${l}: ${(f / into).toFixed(3)}`)
                .join(', ')} (× o que entra na esfera)`,
        );
    }
    const grid = (hash: CausticsHash): Float32Array =>
        tilted ? engineGridTilted(hash, entry.nx, entry.open) : engineGrid(hash, 0.6, entry.nx);
    const a = grid(raw);
    await step(10);
    const b = grid(await readCausticsHash(app, caustics));
    // Custo dos fótons: 60 quadros com as cáusticas ligadas e desligadas, pelo relógio de parede (o tempo de GPU por
    // passo não é confiável no Apple), esperando a GPU no fim de cada lote.
    const timed = async (): Promise<number> => {
        await app.core.readback(
            app.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: 'caustics_sync0',
                byteSize: 16,
            }),
        );
        const t0 = performance.now();
        await step(60);
        await app.core.readback(
            app.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: 'caustics_sync1',
                byteSize: 16,
            }),
        );
        return (performance.now() - t0) / 60;
    };
    const on = await timed();
    caustics.enabled = false;
    await settle(app, 500);
    const off = await timed();
    app.dispose();
    canvas.remove();
    if (errors.length > 0) failures.push(`engine: erros do motor: ${errors.join(' | ')}`);
    // As medidas no canal verde (sem dispersão na esfera: os três iguais).
    const n = entry.nx;
    const cell = 0.6 / n;
    let fluxE = 0;
    let fluxR = 0;
    let diskE = 0;
    let diskR = 0;
    let l1 = 0;
    let change = 0;
    let peakE = 0;
    let peakR = 0;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
            const k = (j * n + i) * 3 + 1;
            const [x, , z] = tilted
                ? tiltedPoint((i + 0.5) / n, (j + 0.5) / n)
                : [-0.3 + (i + 0.5) * cell, 0, -0.3 + (j + 0.5) * cell];
            fluxE += a[k]! * cell * cell;
            fluxR += ref[k]! * cell * cell;
            peakE = Math.max(peakE, a[k]!);
            peakR = Math.max(peakR, ref[k]!);
            if (x * x + z * z < radius * radius) {
                diskE += a[k]! * cell * cell;
                diskR += ref[k]! * cell * cell;
                l1 += Math.abs(a[k]! - ref[k]!);
                change += Math.abs(b[k]! - a[k]!);
            }
        }
    const diskSum = diskR / (cell * cell);
    {
        // O perfil radial da cáustica (a irradiância sem a luz direta), em frações do que entra na esfera.
        const rings = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
        const accE = rings.map(() => 0);
        const accR = rings.map(() => 0);
        for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) {
                const [x, , z] = tilted
                    ? tiltedPoint((i + 0.5) / n, (j + 0.5) / n)
                    : [-0.3 + (i + 0.5) * cell, 0, -0.3 + (j + 0.5) * cell];
                const r = Math.hypot(x, z);
                const k = rings.findIndex((q) => r < q);
                if (k < 0) continue;
                const direct = r >= radius ? entry.open : 0;
                accE[k]! += (a[(j * n + i) * 3 + 1]! - direct) * cell * cell;
                accR[k]! += (ref[(j * n + i) * 3 + 1]! - direct) * cell * cell;
            }
        const into = CAUSTIC_SUN * Math.PI * radius * radius;
        log(
            `engine ${name}: cáustica por anel (GI / referência, × o que entra): ${rings.map((q, k) => `<${q}: ${(accE[k]! / into).toFixed(3)}/${(accR[k]! / into).toFixed(3)}`).join('  ')}`,
        );
    }
    log(
        `engine ${name}: fluxo no receptor ${(fluxE / fluxR).toFixed(4)}× a referência, dentro da sombra ${(diskE / diskR).toFixed(3)}×; pico ${(peakE / CAUSTIC_SUN).toFixed(1)}× o chão aceso (referência ${(peakR / CAUSTIC_SUN).toFixed(1)}×); erro do padrão na sombra ${((100 * l1) / diskSum).toFixed(1)} %; variação em 10 quadros ${((100 * change) / (diskE / (cell * cell))).toFixed(2)} %; custo dos fótons ${(on - off).toFixed(2)} ms/quadro (${on.toFixed(2)} contra ${off.toFixed(2)})`,
    );
    // A porta da T067c: o fluxo na sombra da esfera a ≤ 5 % (SC-007), no receptor a ≤ 2 %, o padrão a ≤ 10 % (L1).
    check(
        Math.abs(diskE / diskR - 1) <= 0.05,
        `engine: ${name} — fluxo na sombra ${(diskE / diskR).toFixed(3)}× a referência`,
    );
    check(
        Math.abs(fluxE / fluxR - 1) <= 0.02,
        `engine: ${name} — fluxo no receptor ${(fluxE / fluxR).toFixed(4)}× a referência`,
    );
    check(
        l1 / diskSum <= 0.1,
        `engine: ${name} — erro do padrão ${((100 * l1) / diskSum).toFixed(1)} %`,
    );
    await writeFixture(`zz-caustics-engine-${name}.png`, await heatmap(a, n, n, CAUSTIC_SUN));
}

/**
 * A água parada (T067c): a camada do tanque dos smokes sem as ondulações, sol a pino e a 30°; o fundo dentro do tanque
 * (longe das paredes) recebe E cos θ (1 − R(θ)) exp(−σ_c h / cos θ_t) por canal, com o Fresnel da água, a absorção dela
 * (`waterLook`) e a altura pelo volume das partículas sobre a área do tanque — a ≤ 3 % (a superfície das partículas não
 * é plana: o foco das ondulações dela redistribui, a média fica). A luz das fontes chega ao fundo em linha reta
 * (`light_transmission`: E cos θ (1 − R(θ)) exp(−σ_c h / cos θ), o caminho sem a refração) e os fótons a corrigem (o
 * hash guarda a correção): o fundo é a soma — a pino a correção é ~0; a 30° ela leva o trecho mais curto da luz
 * refratada na água.
 */
async function caseWater(): Promise<void> {
    for (const deg of [0, 30]) await waterAt(deg);
}

/** A água parada de `layers` camadas com o sol a `deg` graus no plano xy: o hash lido (ou `undefined`). */
async function waterCells(
    name: string,
    deg: number,
    layers: number,
): Promise<CausticsHash | undefined> {
    const theta = (deg * Math.PI) / 180;
    const errors: string[] = [];
    const { app, canvas } = await giApp(320, 200, errors);
    waterScene(app, {
        width: 320,
        height: 200,
        layer: layers,
        light: [Math.sin(theta), -Math.cos(theta), 0],
        material: { ripple: false },
        // Paredes opacas: a conta exata não tem a luz que atravessa o vidro (nem a sombra dele).
        walls: 'opaque',
        eye: [0, 1.6, 0.4],
        target: [0, 0, 0],
    });
    await app.whenReady({ timeoutMs: 30_000 });
    for (let i = 0; i < 180; i++) {
        app.step(1 / 60);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    const caustics = app.defaults.renderer.causticsResource;
    if (app.world.entityIdOfResource(caustics) === undefined) {
        failures.push(`${name}: sem o \`Caustics\` (os estágios padrão o inserem com a água)`);
        app.dispose();
        canvas.remove();
        return undefined;
    }
    const hash = await readCausticsHash(app, caustics);
    app.dispose();
    canvas.remove();
    if (errors.length > 0) failures.push(`${name}: erros do motor: ${errors.join(' | ')}`);
    return hash;
}

/** A altura da camada parada de `layers` camadas de partículas (o volume delas na área do tanque). */
function layerHeight(layers: number): number {
    const [hx, hz] = WATER_TANK;
    const s = WATER_SPACING;
    const count = Math.floor((2 * hx) / s) * Math.floor((2 * hz) / s) * layers;
    return (count * s ** 3) / (4 * hx * hz);
}

async function waterAt(deg: number): Promise<void> {
    const theta = (deg * Math.PI) / 180;
    const layers = 12;
    const hash = await waterCells(`water ${deg}°`, deg, layers);
    if (hash === undefined) return;
    /** A grade em que o fundo é lido (m). */
    const cell = 0.01;
    const [hx, hz] = WATER_TANK;
    const h = layerHeight(layers);
    const ior = 1.333;
    const thetaT = Math.asin(Math.sin(theta) / ior);
    const enter = 1 - fresnel(theta, ior);
    const absorption = [0.45, 0.09, 0.06];
    const sun = 1.2;
    const sum = [0, 0, 0];
    let n = 0;
    for (let px = -0.5 * hx + cell / 2; px < 0.5 * hx; px += cell)
        for (let pz = -0.5 * hz + cell / 2; pz < 0.5 * hz; pz += cell) {
            const v = hash.irradiance([px, 0, pz], [0, 1, 0]);
            for (let c = 0; c < 3; c++) sum[c]! += v[c]!;
            n++;
        }
    for (let c = 0; c < 3; c++) {
        const correction = sum[c]! / Math.max(1, n);
        const straight =
            sun * Math.cos(theta) * enter * Math.exp((-absorption[c]! * h) / Math.cos(theta));
        const got = straight + correction;
        const want =
            sun * Math.cos(theta) * enter * Math.exp((-absorption[c]! * h) / Math.cos(thetaT));
        log(
            `water ${deg}°: canal ${c} — fundo ${got.toFixed(4)} (linha reta ${straight.toFixed(4)} + fótons ${correction.toFixed(4)}) contra ${want.toFixed(4)} (${((100 * (got - want)) / want).toFixed(2)} %; h = ${(100 * h).toFixed(1)} cm, ${n} células)`,
        );
        check(
            Math.abs(got / want - 1) <= 0.03,
            `water ${deg}°: canal ${c} a ${((100 * (got - want)) / want).toFixed(2)} %`,
        );
    }
}

/**
 * A sombra da parede debaixo da água (T067c): o sol a 60° no plano xy entra pelo lado −x; a borda de cima da parede −x
 * (0,5 m) faz sombra no fundo da camada parada. A luz refratada desce mais a pino que a linha reta, e a sombra no fundo
 * é mais curta: a borda em −hx + (0,5 − h) tg θ + h tg θt, não em −hx + 0,5 tg θ. O fundo é a linha reta (zero na sombra
 * dela) mais a correção dos fótons, no canal verde, ao longo de x (faixas de 1 cm, a média em |z| < hz/2): a borda (a
 * metade do nível aceso) a ≤ 1,5 cm da refratada; a faixa entre as duas bordas acesa (a ≤ 5 % do nível aceso; a 60° ela tem
 * 26 cm, vários períodos da cáustica do relevo da camada de partículas — ±20 % em faixas de 7,5 cm) e a
 * sombra antes da refratada escura (≤ 5 % dele).
 */
async function caseShadow(): Promise<void> {
    const deg = 60;
    const theta = (deg * Math.PI) / 180;
    const layers = 12;
    const hash = await waterCells('shadow', deg, layers);
    if (hash === undefined) return;
    /** As faixas ao longo de x (m). */
    const cell = 0.01;
    const [hx, hz] = WATER_TANK;
    const h = layerHeight(layers);
    const wall = 0.5;
    const ior = 1.333;
    const thetaT = Math.asin(Math.sin(theta) / ior);
    const sigma = 0.09;
    const base = 1.2 * Math.cos(theta) * (1 - fresnel(theta, ior));
    const lit = base * Math.exp((-sigma * h) / Math.cos(thetaT));
    const straightLit = base * Math.exp((-sigma * h) / Math.cos(theta));
    const straightEdge = -hx + wall * Math.tan(theta);
    const refractedEdge = -hx + (wall - h) * Math.tan(theta) + h * Math.tan(thetaT);
    const total = (x: number): number => {
        const px = (x + 0.5) * cell;
        let sum = 0;
        let n = 0;
        for (let pz = -0.5 * hz + cell / 2; pz < 0.5 * hz; pz += cell) {
            sum += hash.irradiance([px, 0, pz], [0, 1, 0])[1];
            n++;
        }
        const straight = px >= straightEdge ? straightLit : 0;
        return straight + sum / Math.max(1, n);
    };
    let edge = Number.NaN;
    const first = Math.ceil(-hx / cell);
    let previous: number | undefined;
    for (let x = first; (x + 0.5) * cell < straightEdge + 0.1; x++) {
        const t = total(x);
        if (previous !== undefined && previous < lit / 2 && t >= lit / 2) {
            edge = (x - 0.5 + (lit / 2 - previous) / (t - previous)) * cell;
            break;
        }
        previous = t;
    }
    const mean = (from: number, to: number): number => {
        let sum = 0;
        let n = 0;
        for (let x = Math.ceil(from / cell); (x + 0.5) * cell <= to; x++) {
            sum += total(x);
            n++;
        }
        return sum / Math.max(1, n);
    };
    const band = mean(refractedEdge + 0.02, straightEdge - 0.02);
    const beyond = mean(straightEdge + 0.02, hx - 0.05);
    const dark = mean(-hx + 0.02, refractedEdge - 0.02);
    log(
        `shadow: borda em x = ${edge.toFixed(3)} m contra a refratada ${refractedEdge.toFixed(3)} (a da linha reta ${straightEdge.toFixed(3)}); faixa entre as bordas ${(band / lit).toFixed(3)} do nível aceso, sombra ${(dark / lit).toFixed(3)}, depois da linha reta ${(beyond / lit).toFixed(3)} (h = ${(100 * h).toFixed(1)} cm)`,
    );
    check(
        Math.abs(edge - refractedEdge) <= 0.015,
        `shadow: borda a ${(100 * (edge - refractedEdge)).toFixed(1)} cm da refratada`,
    );
    check(
        Math.abs(band / lit - 1) <= 0.05,
        `shadow: faixa entre as bordas a ${(band / lit).toFixed(3)} do nível aceso`,
    );
    check(dark / lit <= 0.05, `shadow: sombra a ${(dark / lit).toFixed(3)} do nível aceso`);
}

/**
 * A água agitada (T067c item 2, SC-017 `caustics-smooth`/`caustics-temporal`): a mesma representação da referência
 * `water-ripple` — uma caixa de água de 30 cm (malha, o dielétrico da água pelo grafo com as ondulações paradas do smoke
 * `refraction`: inclinação 0,3, 15 cm; 2 × 1,2 m, a densidade de fótons do tanque) sobre o chão claro, o sol a `angle` graus (0 ou 30) — lida do hash na grade da
 * referência (1 cm, 60 × 60): o fluxo no receptor a ≤ 3 %, o erro do padrão (L1 relativo) ≤ 15 %, o contraste (desvio
 * padrão relativo) a ≥ 0,85 do da referência, os platôs (blocos 2 × 2 iguais a 1 % onde a referência varia > 10 %)
 * ≤ 2 % e a variação em 10 quadros, com a superfície parada, ≤ 4 % (o ruído da grade deslocada a cada quadro na
 * densidade do tanque: 2,9 % a 0° e 3,1 % a 30°, onde a própria referência tem 1,7× o ruído; fixado depois da medida).
 */
async function caseRipple(): Promise<void> {
    const deg = Number(new URLSearchParams(location.search).get('angle') ?? '0');
    const theta = (deg * Math.PI) / 180;
    const name = deg === 0 ? 'water-ripple' : `water-ripple-${deg}`;
    const manifest = await readJsonFixture<{ cases: ReferenceEntry[] }>('caustics-reference.json');
    const bytes = await readFixture('caustics-reference.bin');
    const entry = manifest?.cases.find((e) => e.name === name);
    if (entry === undefined || bytes === null) {
        failures.push(`ripple: sem a referência de ${name}`);
        return;
    }
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const ref = all.subarray(entry.offset, entry.offset + entry.nx * entry.ny * 3);
    const errors: string[] = [];
    const { app, canvas } = await giApp(320, 200, errors);
    const caustics = app.defaults.renderer.causticsResource;
    const photons = new URLSearchParams(location.search).get('photons');
    if (photons !== null) caustics.photons = Number(photons);
    app.world.insert(caustics);
    buildGiScene(
        app,
        {
            slabs: [{ id: 1, min: [-2, -0.05, -2], max: [2, 0, 2], color: [0.8, 0.8, 0.8] }],
            sun: { direction: [Math.sin(theta), -Math.cos(theta), 0], illuminance: CAUSTIC_SUN },
            camera: { position: [0, 0.6, 1.6], target: [0, 0, 0], fovY: Math.PI / 5 },
            probeCenter: [0, 0.5, 0],
            regions: new Map([[1, 'chão']]),
        },
        320 / 200,
    );
    const depth = 0.3;
    app.world.insert(
        // A caixa de 2 × 1,2 m (a da referência, de 4 m, é infinita para o receptor de 0,6 m): a densidade de fótons do
        // tanque dos smokes (os ladrilhos com água, ~1,3 m²); em x, a luz do sol a 30° que entra pela face lateral pousa
        // fora do receptor.
        new BoxGeometry({ size: [2, depth + 0.01, 1.2] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, (depth - 0.01) / 2, 0, 1] }))
            .add(
                waterLook({
                    ior: CAUSTIC_WATER.ior,
                    abbe: CAUSTIC_WATER.abbe,
                    absorption: CAUSTIC_WATER.color.map((c) => -Math.log(c)) as [
                        number,
                        number,
                        number,
                    ],
                    roughness: 0,
                    ripple: { strength: 0.3, size: 0.15, speed: 0 },
                }),
            ),
    );
    await settle(app, 4000);
    const step = async (frames: number): Promise<void> => {
        for (let i = 0; i < frames; i++) {
            app.step(1 / 60);
            if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
        }
    };
    const n = entry.nx;
    const grid = (hash: CausticsHash): Float32Array => {
        const out = new Float32Array(n * n * 3);
        const cell = 0.6 / n;
        const sub = 4;
        for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++)
                for (let b = 0; b < sub; b++)
                    for (let a = 0; a < sub; a++) {
                        const v = hash.irradiance(
                            [
                                -0.3 + (i + (a + 0.5) / sub) * cell,
                                0,
                                -0.3 + (j + (b + 0.5) / sub) * cell,
                            ],
                            [0, 1, 0],
                        );
                        for (let k = 0; k < 3; k++)
                            out[(j * n + i) * 3 + k]! += v[k]! / (sub * sub);
                    }
        return out;
    };
    await step(150);
    const a = grid(await readCausticsHash(app, caustics));
    await step(10);
    const b = grid(await readCausticsHash(app, caustics));
    app.dispose();
    canvas.remove();
    if (errors.length > 0) failures.push(`ripple: erros do motor: ${errors.join(' | ')}`);
    for (let c = 0; c < 3; c++) {
        let sumE = 0;
        let sumR = 0;
        let l1 = 0;
        let change = 0;
        for (let k = c; k < a.length; k += 3) {
            sumE += a[k]!;
            sumR += ref[k]!;
            l1 += Math.abs(a[k]! - ref[k]!);
            change += Math.abs(b[k]! - a[k]!);
        }
        const meanE = sumE / (n * n);
        const meanR = sumR / (n * n);
        let varE = 0;
        let varR = 0;
        for (let k = c; k < a.length; k += 3) {
            varE += (a[k]! - meanE) ** 2;
            varR += (ref[k]! - meanR) ** 2;
        }
        const contrast = Math.sqrt(varE) / meanE / (Math.sqrt(varR) / meanR);
        let plateaus = 0;
        let blocks = 0;
        for (let j = 0; j + 1 < n; j++)
            for (let i = 0; i + 1 < n; i++) {
                const at = (q: Float32Array, di: number, dj: number): number =>
                    q[((j + dj) * n + i + di) * 3 + c]!;
                const quad = (q: Float32Array): number[] => [
                    at(q, 0, 0),
                    at(q, 1, 0),
                    at(q, 0, 1),
                    at(q, 1, 1),
                ];
                const e = quad(a);
                const r = quad(ref);
                if (Math.max(...r) - Math.min(...r) <= 0.1 * meanR) continue;
                blocks++;
                if (Math.max(...e) - Math.min(...e) <= 0.01 * meanE) plateaus++;
            }
        const peakE = Math.max(...Array.from({ length: n * n }, (_, i) => a[i * 3 + c]!));
        const peakR = Math.max(...Array.from({ length: n * n }, (_, i) => ref[i * 3 + c]!));
        log(
            `ripple ${deg}°: canal ${c} — fluxo ${(sumE / sumR).toFixed(4)}× a referência; erro do padrão ${((100 * l1) / sumR).toFixed(1)} %; contraste ${contrast.toFixed(3)}× (pico ${(peakE / meanE).toFixed(2)}× a média contra ${(peakR / meanR).toFixed(2)}×); platôs ${blocks > 0 ? ((100 * plateaus) / blocks).toFixed(2) : '0'} % de ${blocks} blocos; variação em 10 quadros ${((100 * change) / sumE).toFixed(2)} %`,
        );
        check(
            Math.abs(sumE / sumR - 1) <= 0.03,
            `ripple ${deg}°: canal ${c} fluxo ${(sumE / sumR).toFixed(4)}×`,
        );
        check(
            l1 / sumR <= 0.15,
            `ripple ${deg}°: canal ${c} padrão ${((100 * l1) / sumR).toFixed(1)} %`,
        );
        check(contrast >= 0.85, `ripple ${deg}°: canal ${c} contraste ${contrast.toFixed(3)}×`);
        check(plateaus <= 0.02 * blocks, `ripple ${deg}°: canal ${c} platôs ${plateaus}/${blocks}`);
        check(
            change / sumE <= 0.04,
            `ripple ${deg}°: canal ${c} variação ${((100 * change) / sumE).toFixed(2)} %`,
        );
    }
    await writeFixture(`zz-caustics-ripple-${deg}.png`, await heatmap(a, n, n, entry.open));
}

const CASES: Record<string, () => Promise<void>> = {
    reference: caseReference,
    engine: caseEngine,
    water: caseWater,
    shadow: caseShadow,
    ripple: caseRipple,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        // As medidas do motor só a pedido (uma por execução, pelo teto de tempo).
        if (only === null ? name !== 'reference' : only !== name) continue;
        await run();
    }
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('CAUSTICS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
