# Intuit Trivia Club

Trivia diaria para el equipo, preparada y administrada por Juana Pandolfi.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación usa Netlify Blobs para compartir preguntas, pistas y puntajes entre dispositivos. En el servidor estático local usa `localStorage` como respaldo. Desde el panel de Juana se pueden exportar puntajes en CSV y un respaldo completo en JSON.

Las pantallas públicas consultan el estado compartido cada 4 segundos. Los borradores y textos de pistas permanecen privados: Juana publica la pregunta, lee las pistas en voz alta durante la daily y recién al cerrar la partida el ranking y el historial muestran el resultado automáticamente.

### Flujo de la anfitriona

1. Guardar la pregunta como borrador privado.
2. Cargar pistas ordenadas de la más difícil a la más fácil.
3. Publicar la pregunta para el equipo.
4. Mostrar y leer pistas en orden mientras baja el puntaje.
5. Seleccionar al ganador para cerrar la partida.

## Deploy en Netlify

1. Importar este repositorio desde GitHub.
2. Netlify detectará `netlify.toml`; no hace falta indicar un comando de build.
3. La contraseña de administración solicitada está validada también en la función de guardado.

La función en `netlify/functions/state.mjs` persiste el estado con Netlify Blobs.
