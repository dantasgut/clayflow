import { cotton, denim, sheerFabric, silk, velvet, wool } from './fabric';
import { carPaint, metalBrushed, metalOxidized, metalPolished } from './metal';
import { openpbr } from './openpbr';
import { ceramic, leather, plasticGloss, plasticMatte, rubber, woodRaw } from './surface';
import { glass, marble, porcelain, skin, wax } from './translucent';
import { woodVarnishedGloss, woodVarnishedMatte } from './wood';

/**
 * Materiais como sub-grafos de ponto (spec 011, R11): o OpenPBR e a biblioteca de 23 materiais prontos — cada um um nó
 * sem ligações obrigatórias que devolve o fechamento, com os parâmetros expostos (valor por uso, sem recompilar) também
 * como entradas (ligáveis a outros nós). Usados inteiros (`Materials.x()`), abertos e religados, ou como nó de um grafo
 * maior.
 */
export const material = {
    openpbr,
    woodRaw,
    woodVarnishedGloss,
    woodVarnishedMatte,
    cotton,
    wool,
    velvet,
    silk,
    denim,
    sheerFabric,
    leather,
    rubber,
    ceramic,
    porcelain,
    plasticMatte,
    plasticGloss,
    metalPolished,
    metalBrushed,
    carPaint,
    glass,
    metalOxidized,
    skin,
    wax,
    marble,
} as const;
