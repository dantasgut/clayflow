// Os casos de teste de todos os nós de ponto da biblioteca (spec 031, R12): um por nó, com a referência da CPU e a
// tolerância documentada no arquivo de cada categoria.
import type { NodeCase } from './cases';
import { conditionCases } from './condition';
import { fieldCases } from './field';
import { mapCases } from './map';
import { mathCases } from './math';
import { noiseCases } from './noiseNodes';
import { outputCases } from './output';
import { spaceCases } from './space';
import { surfaceCases } from './surface';
import { materialCases } from './material';

/** Um caso por nó de ponto da biblioteca. */
export const nodeCases: readonly NodeCase[] = [
    ...mathCases,
    ...mapCases,
    ...noiseCases,
    ...conditionCases,
    ...spaceCases,
    ...fieldCases,
    ...surfaceCases,
    ...outputCases,
    ...materialCases,
];
