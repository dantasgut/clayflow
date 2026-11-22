import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calibrationTruth, calibrationViews } from '../calibrationScene';

// Gerador da verdade da calibração do transporte não local (spec 041, T023): o rastreamento delta nas 18 vistas da nuvem
// isolada, gravado em `fixtures/cloud-calibration-truth.json`. Só roda com `CLOUD_TRUTH=<caminhos>` (100 000 levam ~1 h
// num processo): `CLOUD_TRUTH=100000 npx vitest run scatter.truth`.
const paths = Number(process.env.CLOUD_TRUTH ?? 0);

describe('verdade da calibração do espalhamento', () => {
    it.skipIf(paths <= 0)(
        'grava o rastreamento delta das 18 vistas',
        () => {
            const views = calibrationViews().map((v, i) => ({
                name: v.name,
                ...calibrationTruth(i, paths),
            }));
            writeFileSync(
                join(
                    process.cwd(),
                    'src/elements/media/clouds/reference/__tests__/fixtures/cloud-calibration-truth.json',
                ),
                `${JSON.stringify({ paths, cutDegrees: 2, views }, null, 2)}\n`,
            );
            expect(views).toHaveLength(18);
        },
        7_200_000,
    );
});
