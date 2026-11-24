# Quickstart: Sombras para várias fontes de luz

## Verificar

```sh
npm run ci
npm run smoke -- lighting --headless --timeout 300 --query "case=shadow-sum"
npm run smoke -- lighting --headless --timeout 300 --query "case=sun-travel"
npm run smoke -- lighting --headless --timeout 300 --query "case=spot-shadow"
npm run smoke -- lighting --headless --timeout 300 --query "case=point-shadow"
npm run smoke -- lighting --headless --timeout 300 --query "case=rect-shadow"
npm run smoke -- lighting --headless --timeout 300 --query "case=shadow-limit"
npm run smoke -- lighting --headless --timeout 300 --query "case=shadow-timing"
npm run smoke -- materials --headless --timeout 300 --query "case=subsurface-two-lights"
```

Um processo por vez, sempre `--headless`, só a porta 5181; conferir `ps` depois de cada execução.

## Sem regressão (fechamento)

`lighting`, `sky`, `clouds`, `fog`, `materials`, `globalIllumination`, `refraction`, `parametricSurfaces`,
`antialiasing`, `render`, `rayScene` — os mesmos que ficaram por rodar depois do #54.

## Retrato (claflow-web)

```sh
cd ../claflow-web && npm run video -- pele-rosto-foto-perto,pele-rosto-luz-dura --frames 96 --out <pasta>
```

A luz principal e a contraluz com sombra; a caixa de luz com sombra. Medir a luz das órbitas contra a da testa (SC-004)
e a orelha com e sem a contraluz (SC-005).
