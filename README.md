# Intuit Trivia Club

Trivia diaria para el equipo, preparada y administrada por Juana Pandolfi.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación usa Netlify Blobs para compartir preguntas, pistas y puntajes entre dispositivos. En el servidor estático local usa `localStorage` como respaldo. Desde el panel de Juana se pueden exportar puntajes en CSV y un respaldo completo en JSON.

## Deploy en Netlify

1. Importar este repositorio desde GitHub.
2. Netlify detectará `netlify.toml`; no hace falta indicar un comando de build.
3. La contraseña de administración solicitada está validada también en la función de guardado.

La función en `netlify/functions/state.mjs` persiste el estado con Netlify Blobs.
