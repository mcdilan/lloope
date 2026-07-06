# Lloope · Tienda + Panel de administración (v1)

Tienda-catálogo administrable para **Lloope** (diseños en madera con corte CNC), lista para
publicar como primera versión real. Funciona con **HTML + CSS + JavaScript**, sin backend ni
base de datos, usando un archivo `data/store.json` como contenido publicado.

📄 **¿Vas a publicar el sitio en un dominio real?** Lee primero [`PRODUCCION.md`](PRODUCCION.md):
hosting recomendado, cómo conectar `lloope.cl`, cómo proteger el login del panel, y las
limitaciones de stock/concurrencia explicadas en detalle.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Tienda pública (se hidrata desde `data/store.json`, o desde localStorage/demo si no existe) |
| `cart.html` | Página completa del carrito: edición de cantidades, cupón, boleta/factura y checkout por WhatsApp |
| `admin.html` | Panel de administración privado |
| `lloope-data.js` | Capa de datos compartida: defaults, guardado en localStorage, publicación a JSON |
| `data/store.json` | Contenido **publicado** de la tienda — lo que ven todos los visitantes reales |
| `img/` | Imágenes del sitio |
| `robots.txt`, `sitemap.xml`, `_headers` | SEO y cabeceras de seguridad para el hosting |
| `PRODUCCION.md` | Guía de hosting, dominio, seguridad y arquitectura de datos |

## Cómo entrar al administrador

1. Configura Supabase una vez (login real y "Mis pedidos" del cliente) — ver `PRODUCCION.md`
   sección 5 para los pasos exactos (crear proyecto, correr el SQL, crear tu usuario admin).
2. Abre **`admin.html`** en el navegador e inicia sesión con el usuario admin que creaste en
   Supabase. Mientras no configures Supabase, la pantalla de login te lo indica claramente en
   vez de dejarte entrar.
3. Edita lo que quieras y presiona **Guardar** en cada sección.
4. Haz clic en **"Publicar cambios"** (arriba a la derecha) para descargar el `store.json`
   actualizado — es el archivo que hay que subir al hosting para que **todos** los visitantes
   vean los cambios (ver `PRODUCCION.md`, sección 2).
5. Abre **`index.html`** (botón **"Ver tienda"**) para previsualizar tus cambios en el mismo
   navegador antes de publicar.

> **Importante:** abre los archivos desde un servidor local, no con doble clic (`file://`),
> para que la carga de `data/store.json` funcione igual que en producción:
> ```
> python -m http.server 8000
> ```
> y entra por `http://localhost:8000`.

## Qué se puede modificar desde el panel

Inicio (hero y secciones visibles), Menú público, Productos (CRUD completo con SKU, precio, oferta,
stock, destacado, personalizable, medidas, material, imágenes), Categorías, Imágenes (logo, hero,
galería, imagen por producto), Contacto y redes, Carrito (moneda, mínimo, despacho, textos de botones),
Pagos (medios + transferencia + campos de pago online), Pedidos (estados + WhatsApp), **Banners de
campaña** (Cyber Day, Black Friday, aniversario, con vigencia por fecha), **Cupones de descuento**
(porcentaje o monto fijo, vigencia, uso único), Textos legales, Configuración general (nombre, logo,
colores, moneda, IVA, estado de la tienda), Usuarios.

Botón **"Restaurar demo"** vuelve todo a los datos de ejemplo.

## Comportamiento automático de la tienda

- Si **ningún medio de pago está activo** (o el carrito está desactivado), el carrito se oculta
  y cada producto muestra **"Consultar por WhatsApp"** en vez de "Agregar al carrito", con un
  aviso de que las compras online estarán disponibles pronto.
- Si **no hay productos activos**, el catálogo muestra un estado vacío en vez de una grilla en
  blanco.
- La cantidad que se puede agregar al carrito queda **limitada al stock** mostrado.
- El carrito lateral en `index.html` es solo una **vista previa** (nombre, cantidad, subtotal);
  la edición completa, el cupón, la elección boleta/factura y el checkout viven en `cart.html`.
- El carrito se guarda en `localStorage` (`lloope_cart_session`) y sobrevive la navegación entre
  páginas y una recarga simple.
- Pop-up de salida con cupón de bienvenida (Cupones → "Cupón de bienvenida"): se activa al
  detectar intención de salida o tras un rato en celular, y guarda el correo capturado **solo en
  el navegador del visitante** — no le llega al dueño de la tienda sin conectar un servicio real
  (ver `PRODUCCION.md`, sección 8).
- El ícono de cuenta guarda un **perfil de invitado** (nombre, correo, teléfono) en el navegador
  del cliente para precargar el checkout — no es una cuenta con contraseña.
- Cada pedido enviado por WhatsApp incluye la frase "sujeto a confirmación de stock y
  disponibilidad" (ver `PRODUCCION.md`, sección 7, sobre por qué esto es necesario sin backend).

## Qué es simulado (mockup)

- **Login de admin y cuentas de cliente**: ya son reales (Supabase Auth), pero **solo si
  configuraste `LLOOPE_SUPABASE`** en `lloope-data.js` — ver `PRODUCCION.md` sección 5. Sin
  esa configuración, el login del panel no deja entrar y "Mi cuenta" vuelve al perfil de
  invitado de siempre.
- **Imágenes**: se guardan como base64 en el navegador (localStorage) mientras editas; el
  archivo publicado (`store.json`) sí puede usar rutas normales `img/...` o URLs externas.
- **Pagos**: solo pantallas de configuración. **No** se piden ni guardan datos de tarjeta (número,
  CVV, vencimiento). El botón "Probar configuración" muestra un mensaje simulado.
- **Cupones de un solo uso**: se controlan por navegador (localStorage), no a prueba de trampas
  entre dispositivos — para eso se necesita backend (fase 2).
- **Usuarios administradores** (sección "Usuarios" del panel, equipo/roles): siguen siendo solo
  demo en tu navegador. El acceso real al panel lo controla Supabase Auth, no esta lista.
- **Pedidos de checkout de invitado** (sin cuenta): quedan solo como mensaje de WhatsApp, igual
  que siempre — no se registran en ningún lado.

## Para llevarlo a producción con pagos reales (fase 2)

Ver el detalle completo, con ejemplos de código, en [`PRODUCCION.md`](PRODUCCION.md). Resumen:

- **Backend**: Node.js (NestJS/Express), Laravel, Spring Boot o similar.
- **Base de datos**: PostgreSQL o MySQL (Supabase da ambas cosas gratis, junto con Auth y Storage).
- **Autenticación real**: sesiones seguras (httpOnly) o **JWT**; contraseñas cifradas con **bcrypt/argon2**.
- **Rutas del panel protegidas por rol** en el servidor.
- **Imágenes** en **Cloudinary, Amazon S3** o almacenamiento del servidor (no base64/localStorage).
- **Pagos** integrados de verdad con **Webpay (Transbank), Mercado Pago o Flow**, validando el pago
  **desde el backend**. Las **llaves privadas** van en **variables de entorno**, nunca en el frontend.
- **Stock con transacciones atómicas** para evitar sobreventa cuando compran dos personas a la vez.
- **HTTPS obligatorio** y **backups** de la base de datos.

## Llaves de localStorage

**Contenido administrable** (editado en `admin.html`, publicado en `data/store.json`):
`lloope_settings`, `lloope_home`, `lloope_menu`, `lloope_products`, `lloope_categories`,
`lloope_images`, `lloope_contact`, `lloope_cart_config`, `lloope_payment_config`,
`lloope_legal_texts`, `lloope_coupons`, `lloope_banners`, `lloope_welcome_popup`.

**Nunca se publican en `store.json`** (viven solo en el navegador del admin):
`lloope_orders` (semilla de demostración; una vez que configuras Supabase los pedidos reales
viven ahí, no aquí — ver `PRODUCCION.md` sección 5), `lloope_users` (equipo/roles, solo demo).

**Estado del visitante** (no se publica, vive solo en el navegador de cada cliente):
`lloope_cart_session` (carrito en curso), `lloope_customer_profile` (perfil de invitado, solo
se usa si Supabase no está configurado), `lloope_leads` (correos capturados por el pop-up de
bienvenida), `lloope_used_coupons` (cupones de un solo uso ya utilizados en ese navegador).

La sesión real de "Mi cuenta" y del login de `admin.html` ya no vive en una llave de Lloope:
la maneja el SDK de Supabase en su propia llave de `localStorage` una vez que configuras
`LLOOPE_SUPABASE` (ver `PRODUCCION.md` sección 5).
