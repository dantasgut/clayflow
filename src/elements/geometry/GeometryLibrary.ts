import type { Geometry } from '../../scene/components/Geometry';

/**
 * Flyweight Registry para Geometry (GoF Flyweight Pattern).
 * Compartilha a mesma instância de Geometry (e seus buffers na VRAM) entre
 * múltiplos Mesh que usam a mesma malha — evita uploads duplicados.
 *
 * @example
 * // 1000 árvores com o mesmo VBO na VRAM:
 * const treeGeo = GeometryLibrary.get('tree', () => new TreeGeometry());
 * for (let i = 0; i < 1000; i++) {
 *     scene.add(new Mesh(treeGeo, new StandardMaterial()));
 * }
 */
export class GeometryLibrary {
    private static cache = new Map<string, Geometry>();

    public static get<T extends Geometry>(key: string, factory: () => T): T {
        if (!GeometryLibrary.cache.has(key)) {
            GeometryLibrary.cache.set(key, factory());
        }
        return GeometryLibrary.cache.get(key) as T;
    }

    public static has(key: string): boolean {
        return GeometryLibrary.cache.has(key);
    }

    /** Remove uma entrada do cache (ex: ao descarregar um nível). */
    public static evict(key: string): void {
        GeometryLibrary.cache.delete(key);
    }

    public static clear(): void {
        GeometryLibrary.cache.clear();
    }
}
