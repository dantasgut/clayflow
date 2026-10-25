// Cenas do smoke de comportamento de fluido (spec 030): gota e filete sem gravidade, barragem, menisco no tanque, placa
// inclinada, gota pousada e barragem MPM — cada uma com o seu `ParticlePhysics` (coesão, adesão, XSPH, viscosidade).
// Determinísticas (jitter por semente). `decorate` permite desenhar o corpo (vídeos) sem mudar a simulação.
import { FluidBody, GravityField, ParticlePhysics, RigidBody } from 'clayflow';
import type { Application, ParticlePhysicsOptions } from 'clayflow';
import { rng } from './particleScenes';

/** Espaçamento das cenas (m). */
export const S = 0.025;
/** Meia largura interna do tanque (m). */
export const TANK = 0.5;
/** Placa inclinada: meia extensão (x, espessura, z), ângulo (rad) e centro. */
export const PLATE = {
    half: [0.35, 0.02, 0.15] as const,
    angle: Math.PI / 6,
    center: [0, 0.35, 0] as const,
};

export type Algorithm = 'SPH' | 'PBF' | 'MPM';

/** Uma cena: material, gravidade, partículas e sólidos. */
export interface BehaviorScene {
    readonly algorithm: Algorithm;
    readonly material: ParticlePhysicsOptions;
    readonly gravity: readonly [number, number, number];
    readonly position: readonly number[];
    /** Velocidades iniciais (x, y, z por partícula); padrão zero. */
    readonly velocity?: readonly number[];
    readonly solids?: (app: Application) => void;
}

/** Bloco nx × ny × nz com espaçamento `s` a partir de `origin`, com jitter de 5% (semente). */
export function grid(
    n: readonly [number, number, number],
    origin: readonly [number, number, number],
    seed: number,
    s = S,
): number[] {
    const r = rng(seed);
    const out: number[] = [];
    for (let y = 0; y < n[1]; y++)
        for (let z = 0; z < n[2]; z++)
            for (let x = 0; x < n[0]; x++)
                out.push(
                    origin[0] + s * (x + 0.5) + (r() - 0.5) * s * 0.05,
                    origin[1] + s * (y + 0.5) + (r() - 0.5) * s * 0.05,
                    origin[2] + s * (z + 0.5) + (r() - 0.5) * s * 0.05,
                );
    return out;
}

/** Bloco centrado em `c`. */
export function centered(
    n: readonly [number, number, number],
    c: readonly [number, number, number],
    seed: number,
    s = S,
): number[] {
    return grid(n, [c[0] - (n[0] * s) / 2, c[1] - (n[1] * s) / 2, c[2] - (n[2] * s) / 2], seed, s);
}

/** Chão estático com topo em y = 0. */
export function ground(app: Application): void {
    app.world.insert(
        new RigidBody({ shape: 'box', mass: 0, halfExtents: [3, 0.5, 3], position: [0, -0.5, 0] }),
    );
}

/** Chão e quatro paredes: tanque de 2·TANK × 2·TANK. */
export function tank(app: Application): void {
    ground(app);
    const t = 0.1;
    const h = 0.6;
    for (const [x, z, hx, hz] of [
        [TANK + t, 0, t, TANK + 2 * t],
        [-(TANK + t), 0, t, TANK + 2 * t],
        [0, TANK + t, TANK, t],
        [0, -(TANK + t), TANK, t],
    ] as const) {
        app.world.insert(
            new RigidBody({
                shape: 'box',
                mass: 0,
                halfExtents: [hx, h, hz],
                position: [x, h - 0.2, z],
            }),
        );
    }
}

/** Chão e a placa inclinada (descendo para +x). */
export function incline(app: Application): void {
    ground(app);
    const a = -PLATE.angle / 2;
    app.world.insert(
        new RigidBody({
            shape: 'box',
            mass: 0,
            halfExtents: [...PLATE.half],
            position: [...PLATE.center],
            rotation: [0, 0, Math.sin(a), Math.cos(a)],
        }),
    );
}

/** Ponto da superfície de cima da placa a `u` ∈ [−1, 1] ao longo dela, mais `lift` na normal. */
export function onPlate(u: number, lift: number): [number, number, number] {
    const c = Math.cos(PLATE.angle);
    const s = Math.sin(PLATE.angle);
    const along = u * PLATE.half[0];
    const up = PLATE.half[1] + lift;
    // Eixo da placa (cos, −sen) e normal (sen, cos) no plano xy.
    return [PLATE.center[0] + along * c + up * s, PLATE.center[1] - along * s + up * c, 0];
}

/** Distância de um ponto à face de cima da placa (na normal). */
export function plateDistance(p: readonly [number, number, number]): number {
    const c = Math.cos(PLATE.angle);
    const s = Math.sin(PLATE.angle);
    const dx = p[0] - PLATE.center[0];
    const dy = p[1] - PLATE.center[1];
    return dx * s + dy * c - PLATE.half[1];
}

/** Coordenada ao longo da placa em múltiplos da meia extensão (−1 em cima, +1 embaixo). */
export function plateCoordinate(p: readonly [number, number, number]): number {
    const c = Math.cos(PLATE.angle);
    const s = Math.sin(PLATE.angle);
    return ((p[0] - PLATE.center[0]) * c - (p[1] - PLATE.center[1]) * s) / PLATE.half[0];
}

const ZERO_G = [0, 0, 0] as const;
const DOWN = [0, -9.81, 0] as const;

/** Gota alongada (16 × 6 × 6) sem gravidade: com coesão, arredonda. */
export function drop(algorithm: Algorithm, cohesion: number): BehaviorScene {
    return {
        algorithm,
        material: { particleSpacing: S, cohesion },
        gravity: ZERO_G,
        position: centered([16, 6, 6], [0, 0, 0], 31),
    };
}

/**
 * Filete (64 × 3 × 3 por padrão) sem gravidade, esticado com v = x · `stretch` (jato): com coesão, parte-se em gotas
 * (Rayleigh-Plateau).
 */
export function filament(
    algorithm: Algorithm,
    cohesion: number,
    n: readonly [number, number, number] = [64, 3, 3],
    xsph?: number,
    stretch = 0,
): BehaviorScene {
    const position = centered(n, [0, 0, 0], 37);
    return {
        algorithm,
        material: { particleSpacing: S, cohesion, ...(xsph !== undefined ? { xsph } : {}) },
        gravity: ZERO_G,
        position,
        velocity: position.map((v, i) => (i % 3 === 0 ? stretch * v : 0)),
    };
}

/** Barragem (14³) encostada na parede −x do tanque. */
export function dam(
    algorithm: Algorithm,
    material: ParticlePhysicsOptions,
    n: readonly [number, number, number] = [14, 14, 14],
): BehaviorScene {
    const s = material.particleSpacing ?? S;
    return {
        algorithm,
        material: { particleSpacing: S, ...material },
        gravity: DOWN,
        position: grid(n, [-TANK, 0, -(n[2] * s) / 2], 41, s),
        solids: tank,
    };
}

/** Camada parada de 6 partículas cobrindo o tanque: com adesão, sobe junto às paredes (menisco). */
export function meniscus(adhesion: number, cohesion = 0): BehaviorScene {
    const n = Math.floor((2 * TANK) / S);
    return {
        algorithm: 'SPH',
        material: { particleSpacing: S, adhesion, cohesion },
        gravity: DOWN,
        position: grid([n, 6, n], [-TANK, 0, -TANK], 43),
        solids: tank,
    };
}

/** Gota (6³) solta sobre o alto da placa inclinada. */
export function slope(adhesion: number, cohesion: number): BehaviorScene {
    const top = onPlate(-0.75, 0.5 * S + 3 * S);
    return {
        algorithm: 'SPH',
        material: { particleSpacing: S, adhesion, cohesion },
        gravity: DOWN,
        position: centered([6, 6, 6], top, 47),
        solids: incline,
    };
}

/** Gota (8³) pousada no chão: com mais adesão, espalha mais. */
export function puddle(adhesion: number, cohesion: number): BehaviorScene {
    return {
        algorithm: 'SPH',
        material: { particleSpacing: S, adhesion, cohesion },
        gravity: DOWN,
        position: grid([8, 8, 8], [-4 * S, 0, -4 * S], 53),
        solids: ground,
    };
}

/** Monta a cena no app; `decorate` recebe o corpo antes da inserção (material de desenho nos vídeos). */
export function buildBehavior(
    app: Application,
    scene: BehaviorScene,
    decorate?: (body: FluidBody) => void,
): { material: ParticlePhysics; body: FluidBody } {
    app.world.insert(new GravityField({ acceleration: [...scene.gravity, 0] }));
    const material = new ParticlePhysics(scene.material);
    app.world.insert(material);
    scene.solids?.(app);
    const body = new FluidBody({
        algorithm: scene.algorithm,
        position: scene.position,
        ...(scene.velocity !== undefined ? { velocity: scene.velocity } : {}),
    });
    decorate?.(body);
    app.world.insert(body);
    return { material, body };
}
