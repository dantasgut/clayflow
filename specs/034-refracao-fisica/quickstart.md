# Quickstart — validar a 034

```sh
npm run ci
npm run smoke -- readiness,refraction,antialiasing,giNoise --headless
npm run smoke -- --headless              # todos
npm run build && npm run smoke -- --headless --dist
npm run bench:check -- --headless
npm run video -- lente,dispersao,vidros,agua,causticas,cornell,day,fog,living --out <pasta>
```

O que cada smoke novo mede:

| Smoke          | Medida                                                                                                      | Critério       |
| -------------- | ----------------------------------------------------------------------------------------------------------- | -------------- |
| `readiness`    | Névoa/GI/vidro/colisor inseridos com a cena rodando; medida após `whenReady` igual à de espera longa; prazo | SC-008         |
| `refraction`   | Seis cenas da US1 contra o traçador da CPU; lente 4×; GI ligada/desligada/ausente; leituras de `scene_copy` | SC-001–SC-003  |
| `antialiasing` | Parada contra 64 jitters; bola atrás do vidro (rastro); órbita (borrão); padrão rasante                     | SC-004, SC-005 |
| `giNoise`      | Cornell e janela em `medium`/`high`: viés por face, manchas (erro lento), cintilação; névoa andando         | SC-006         |

Cena da lente para conferir à mão: esfera IOR 1,5 de raio 0,45 m a 0,2 m do painel xadrez emissor 2 × 2 m em z = −2,
câmera a 1,5 m; a borda do xadrez vista pela esfera não pode mostrar degrau nem rastro quando a bola laranja passa.
