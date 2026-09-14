# Reglas del proyecto

- Usar TypeScript en modo estricto.
- No colocar contraseñas, tokens, claves privadas ni otros secretos en el código.
- Manejar todas las variables sensibles mediante variables de entorno.
- Nunca modificar directamente una base de datos de producción.
- Gestionar los cambios de esquema de PostgreSQL/Supabase mediante migraciones.
- Diseñar y desarrollar la aplicación con un enfoque offline-first.
- Usar el mapa solamente como herramienta de orientación, no para seguimiento continuo.
- Mantener una separación clara entre las áreas de turista y administración.
- Ejecutar `npm run lint` y `npm run build` antes de considerar terminada una tarea.
- Evitar dependencias innecesarias.
- No realizar commits automáticamente.
