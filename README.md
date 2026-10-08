# Feria de Servicios - Biblioteca Universidad El Bosque

Micrositio estatico de PRUEBA. Contiene 416 titulos extraidos del Excel proporcionado, conservando solamente titulo, autor, anio e ISBN. No almacena ni envia votos reales.

## Publicar en GitHub Pages
1. Crear un repositorio publico llamado `feria-libros`.
2. Subir `index.html`, `styles.css`, `app.js` y `libros.json` a la raiz del repositorio (se puede subir el resto tambien).
3. Ir a Settings > Pages > Build and deployment > Source: Deploy from a branch.
4. Seleccionar `main`, carpeta `/(root)`, y pulsar Save.
5. Abrir `https://TU-USUARIO.github.io/feria-libros/` tras completarse el despliegue.

## Importante
- La demostracion **NO registra votos compartidos**. No usar para recibir votaciones reales durante la feria.
- Para guardar votos, prevenir duplicados y exportar resultados, hace falta configurar Supabase y una funcion de registro segura, en una segunda fase.
- No guardar claves secretas, contrasenas, datos personales ni tokens privilegiados en GitHub Pages.
- `catalogo_prueba.csv` es un archivo auxiliar con los mismos datos del JSON.
- Para probar localmente, ejecutar `python -m http.server 8000` dentro de esta carpeta y entrar a http://localhost:8000
