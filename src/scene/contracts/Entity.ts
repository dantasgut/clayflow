/**
 * Entity é a unidade composicional da Camada 2 (Sync) — qualquer objeto
 * inserido em `World` herda de Entity. A composição é via `add(child)`:
 * uma Entity-pai agrega Entity-filhas em uma árvore plana, e
 * `World.insert(root)` percorre a árvore registrando cada filho como
 * `Resource` indexável.
 *
 * Padrão de uso típico:
 * ```ts
 * const box = new BoxGeometry({ size: [1, 1, 1] });
 * box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1] }));
 * box.add(new Transform({ position: [0, 0, 0, 1] }));
 * world.insert(box);  // registra geometria + material + transform
 * ```
 *
 * Subclasses concretas (Camera, Transform, BoxGeometry, etc.) implementam
 * `Resource` (descritores GPU + dados), enquanto Entity puro provê apenas
 * a hierarquia. Entity é abstrata — não pode ser instanciada diretamente.
 */
export abstract class Entity {
    /**
     * Filhos da entidade. Privado — manipulado apenas via `add()` para
     * preservar o invariante "uma Entity tem um único pai" (não validado
     * em runtime, mas convenção do projeto).
     */
    private readonly parts: Entity[] = [];

    /**
     * Anexa uma Entity-filha. Retorna `this` para chaining fluente.
     * Não valida ciclos nem múltiplos pais — responsabilidade do caller.
     */
    add(e: Entity): this {
        this.parts.push(e);
        return this;
    }

    /**
     * Lista somente-leitura dos filhos diretos. World.insert traverse essa
     * árvore recursivamente para coletar todos os Resources de um root.
     */
    get attached(): readonly Entity[] {
        return this.parts;
    }
}
