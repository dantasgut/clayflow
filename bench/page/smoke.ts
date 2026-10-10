/**
 * Página de smoke do harness: carrega `src/__smokes__/<name>.ts` (parâmetro `?name=`). Os smokes importam o
 * barrel público `clayflow` — resolvido pelo alias do servidor do bench para o código-fonte ou, com `--dist`, para
 * o build minificado. Cada smoke escreve no `#log` e termina com `… SMOKE PASSED` ou `FAIL: …`.
 */
const name = new URLSearchParams(location.search).get('name');
const log = document.getElementById('log');
if (name === null || !/^[A-Za-z0-9]+$/.test(name)) {
    if (log !== null) log.textContent = 'FAIL: parâmetro ?name= ausente ou inválido';
} else {
    import(`../../src/__smokes__/${name}.ts`).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (log !== null)
            log.textContent += `\nFAIL: não foi possível carregar o smoke ${name}: ${msg}`;
    });
}
