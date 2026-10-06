/**
 * Catálogo de cenas do benchmark.
 *
 * Como adicionar uma cena (US3, SC-004 — espelha `quickstart.md` §5):
 *   1. Crie `bench/scenes/<id>/scene.ts` exportando a `SceneDefinition` (id kebab-case, título,
 *      descrição, fase do roadmap, semente, câmera e variantes com `params`).
 *   2. Para cada engine, crie `clayflow.ts` / `three.ts` com `export default` de uma
 *      `SceneImplementation` (carregada de forma lazy pela definição) — ou declare
 *      `{ unsupported: 'motivo', until: 'F5' }` para a engine que ainda não suporta.
 *   3. Acrescente a definição à lista `CATALOG` abaixo. Executor, métricas, relatório e baseline
 *      já a incluem; `validateCatalog` aponta erros de declaração ao carregar.
 *
 * Regras: conteúdo só a partir de `rng` e `variant.params`; o lado clayflow importa apenas de
 * `clayflow` (barrel público — ESLint bloqueia o resto); limitações do motor que pesam no resultado
 * vão em `limitations`, nunca contornadas com acesso a internos.
 */
import { instancesScene } from '../scenes/instances/scene';
import { pointLightsScene } from '../scenes/point-lights/scene';
import { rigidBodiesScene } from '../scenes/rigid-bodies/scene';
import { skinnedCharactersScene } from '../scenes/skinned-characters/scene';
import { uniqueObjectsScene } from '../scenes/unique-objects/scene';
import { ENGINES, isUnsupported, type SceneDefinition } from './types';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Erro de declaração do catálogo, apontando a cena. */
export class CatalogError extends Error {
    override readonly name = 'CatalogError';
}

/** Valida as definições (ids, variantes, engines declaradas, fase e semente). */
export function validateCatalog(scenes: readonly SceneDefinition[]): readonly SceneDefinition[] {
    const ids = new Set<string>();
    for (const s of scenes) {
        const where = `cena '${s.id}'`;
        if (!KEBAB.test(s.id)) throw new CatalogError(`${where}: id deve ser kebab-case.`);
        if (ids.has(s.id)) throw new CatalogError(`${where}: id duplicado.`);
        ids.add(s.id);
        if (s.variants.length === 0)
            throw new CatalogError(`${where}: precisa de ao menos uma variante.`);
        const variantIds = new Set<string>();
        for (const v of s.variants) {
            if (v.id.length === 0) throw new CatalogError(`${where}: variante sem id.`);
            if (variantIds.has(v.id))
                throw new CatalogError(`${where}: variante '${v.id}' duplicada.`);
            variantIds.add(v.id);
        }
        for (const engine of ENGINES) {
            const impl = (s.implementations as Partial<SceneDefinition['implementations']>)[engine];
            if (impl === undefined) {
                throw new CatalogError(
                    `${where}: engine '${engine}' sem implementação nem 'unsupported'.`,
                );
            }
            if (isUnsupported(impl) && impl.unsupported.trim().length === 0) {
                throw new CatalogError(`${where}: 'unsupported' de '${engine}' precisa de motivo.`);
            }
        }
        if (s.phase.trim().length === 0) throw new CatalogError(`${where}: fase ausente.`);
        if (!Number.isInteger(s.seed))
            throw new CatalogError(`${where}: semente deve ser inteira.`);
    }
    return scenes;
}

/** Cenas de referência da F0 (FR-002), validadas ao carregar. */
export const CATALOG: readonly SceneDefinition[] = validateCatalog([
    instancesScene,
    uniqueObjectsScene,
    pointLightsScene,
    skinnedCharactersScene,
    rigidBodiesScene,
]);

/** Busca uma cena pelo id. */
export function findScene(id: string): SceneDefinition | undefined {
    return CATALOG.find((s) => s.id === id);
}
