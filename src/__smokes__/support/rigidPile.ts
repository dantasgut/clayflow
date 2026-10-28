// Pilha de corpos rígidos dos smokes de contato (spec 004, `rigidContacts`; spec 007, `contactSet`): recinto estático
// (chão e quatro paredes) e colunas de esferas e caixas em camadas, com ruído determinístico.
import { GravityField, RigidBody } from 'clayflow/web';
import type { Application } from 'clayflow/web';
import { mulberry32 } from './random';

export const RADIUS = 0.25;
export const BOX_HALF = 0.2;
export const GROUND_HALF = 20;
export const WALL_HEIGHT = 4;

/** Insere gravidade, recinto e `count` corpos (esferas e caixas alternadas) em `app`. */
export function buildRigidPile(app: Application, count: number): void {
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new RigidBody({
            shape: 'box',
            mass: 0,
            halfExtents: [GROUND_HALF, 0.5, GROUND_HALF],
            position: [0, -0.5, 0],
        }),
    );
    for (const [x, z, hx, hz] of [
        [GROUND_HALF + 0.5, 0, 0.5, GROUND_HALF + 1],
        [-GROUND_HALF - 0.5, 0, 0.5, GROUND_HALF + 1],
        [0, GROUND_HALF + 0.5, GROUND_HALF + 1, 0.5],
        [0, -GROUND_HALF - 0.5, GROUND_HALF + 1, 0.5],
    ] as const) {
        app.world.insert(
            new RigidBody({
                shape: 'box',
                mass: 0,
                halfExtents: [hx, WALL_HEIGHT / 2, hz],
                position: [x, WALL_HEIGHT / 2, z],
            }),
        );
    }
    // Pilhas: colunas numa grade com espaçamento maior que um diâmetro e camadas sucessivas (sem sobreposição inicial),
    // com ruído pequeno para quebrar a simetria.
    const random = mulberry32(1337);
    const spacing = 0.6;
    const perRow = Math.floor((GROUND_HALF * 1.5) / spacing);
    const perLayer = perRow * perRow;
    for (let i = 0; i < count; i++) {
        const layer = Math.floor(i / perLayer);
        const cell = i % perLayer;
        const jitter = (): number => (random() * 2 - 1) * 0.05;
        const position = [
            ((cell % perRow) - (perRow - 1) / 2) * spacing + jitter(),
            0.5 + layer * spacing,
            (Math.floor(cell / perRow) - (perRow - 1) / 2) * spacing + jitter(),
        ] as const;
        app.world.insert(
            i % 2 === 0
                ? new RigidBody({
                      shape: 'sphere',
                      radius: RADIUS,
                      mass: 1,
                      rollingFriction: 0.01,
                      position,
                  })
                : new RigidBody({
                      shape: 'box',
                      halfExtents: [BOX_HALF, BOX_HALF, BOX_HALF],
                      mass: 1,
                      position,
                  }),
        );
    }
}
