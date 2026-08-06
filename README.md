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

1. Crear una única vez la biblioteca de categorías, cada una con su porcentaje extra.
2. Guardar la pregunta como borrador privado seleccionando una categoría.
3. Cargar pistas ordenadas de la más difícil a la más fácil.
4. Publicar la pregunta para el equipo.
5. Mostrar y leer pistas en orden mientras baja el puntaje.
6. Seleccionar al ganador para cerrar la partida.

El puntaje base es 20. El extra de categoría se aplica proporcionalmente antes de redondear cada tramo de pistas; una categoría con 25% y cuatro pistas recorre 25, 20, 15, 10 y 5 puntos.

## Deploy en Netlify

1. Importar este repositorio desde GitHub.
2. Netlify detectará `netlify.toml`; no hace falta indicar un comando de build.
3. La contraseña de administración solicitada está validada también en la función de guardado.

La función en `netlify/functions/state.mjs` persiste el estado con Netlify Blobs.
