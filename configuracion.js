export const configuracion = {
  motor: 'libretranslate', // También puedes usar 'ollama'.
  idiomaOrigen: 'auto', // O un código explícito: en, fr, pt, ja, zh, etc.
  archivoOrigen: 'default.json', // Dentro de cada carpeta i18n en el modo «carpeta».

  libretranslate: 'http://127.0.0.1:5000',
  ollama: 'http://127.0.0.1:11434',
  modeloOllama: 'qwen2.5:7b', // Debe estar descargado en tu equipo.
  tiempoEsperaMs: 180_000, // Por petición al motor, en milisegundos.

  // Claves de i18n que contienen datos internos y deben copiarse sin traducir.
  clavesSinTraducir: [],
};
