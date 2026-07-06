# Lloope · Guía para publicar la v1 en producción

Este documento explica cómo llevar el sitio (`index.html` + `admin.html` + `lloope-data.js`)
desde "proyecto en mi computador" a "sitio real en lloope.cl", qué tan seguro es hacerlo así,
y qué haría falta más adelante para activar pagos online de verdad.

---

## 1. Qué es esta v1 y qué no es

Esta v1 es una **tienda-catálogo administrable sin backend ni base de datos**:

- Sirve para mostrar el catálogo, capturar interés de clientes y recibir pedidos por WhatsApp.
- El panel admin permite editar todo el contenido sin tocar código.
- **No** procesa pagos con tarjeta reales todavía (eso es fase 2, ver sección 7).
- El **catálogo y el contenido** (productos, textos, imágenes, etc.) no tienen una base de
  datos compartida: usan un archivo `data/store.json` que tú publicas manualmente desde el
  panel cada vez que haces cambios importantes.
- Las **cuentas de cliente y los pedidos** sí pueden usar una base de datos real (Supabase),
  si la configuras — ver sección 5. Es opcional: sin configurarla, el sitio funciona igual
  que si no existiera esta opción.

Esto es una decisión correcta para partir: es gratis, rápido de publicar, y ya resuelve el
objetivo principal ("mostrar productos, recibir interés de clientes"). No es una limitación
que "se nos olvidó resolver" — es la arquitectura correcta para esta etapa.

---

## 2. Cómo se publican los cambios (muy importante)

`localStorage` (donde guarda sus cambios el panel admin) es **privado de cada navegador y
dispositivo**. Si editas un producto en el admin desde tu notebook, ese cambio **no aparece
solo** en el celular de un cliente que visite la tienda — su navegador nunca vio ese cambio.

Por eso el panel tiene un botón **"Publicar cambios"** (arriba a la derecha):

1. Edita lo que necesites en el panel (productos, precios, banners, cupones, contacto, etc.).
2. Haz clic en **Publicar cambios** → se descarga un archivo `store.json`.
3. Sube ese archivo a la carpeta `data/` de tu sitio (reemplazando el anterior) y despliega
   (arrastrar el archivo en el panel de Cloudflare Pages / Netlify, o hacer commit + push si
   usas GitHub).
4. Espera 1-2 minutos y listo: **todos** los visitantes ven el cambio.

Mientras no publiques, tu propio navegador seguirá mostrando tus borradores (para que puedas
revisar antes de publicar), pero el resto del mundo sigue viendo la última versión publicada.

`orders` (pedidos) y `users` (usuarios) **nunca** se incluyen en `store.json` porque contienen
datos de clientes — quedan solo en tu navegador, como un registro manual de lo que confirmas
por WhatsApp.

---

## 3. Hosting: dónde publicar

| Opción | Costo | A favor | En contra |
|---|---|---|---|
| **Cloudflare Pages** ⭐ recomendado | Gratis | CDN rápido, HTTPS automático, se integra con **Cloudflare Access** (login real gratis para `/admin.html`, ver sección 5), soporta `_headers` | Requiere crear cuenta Cloudflare |
| **Netlify** | Gratis | Muy fácil de usar, **Netlify Identity** (login real) integrado, soporta `_headers` | Límites del plan gratis algo menores que Cloudflare |
| **Vercel** | Gratis | Excelente para proyectos con frameworks (no es el caso aquí), buen dashboard | No aporta ventaja extra sobre Cloudflare/Netlify para un sitio estático simple |
| **GitHub Pages** | Gratis | Simple si ya usas GitHub | **No soporta `_headers`** ni gating de acceso propio; para proteger `/admin.html` necesitarías igual poner Cloudflare por delante |
| **Hosting tradicional (cPanel, etc.)** | Pago | Control total, útil si ya lo tienes contratado | Sin CDN/HTTPS automático salvo que lo configures tú; no aporta nada que no den las opciones gratis de arriba |

**Recomendación:** Cloudflare Pages. Resuelve hosting + CDN + HTTPS + protección del panel admin
(sección 5) en un solo lugar gratuito. Netlify es la alternativa igual de válida si prefieres
su interfaz.

**Pasos generales para publicar (Cloudflare Pages):**
1. Crea una cuenta gratuita en Cloudflare.
2. Crea un proyecto de "Pages" y sube la carpeta del proyecto (o conéctalo a un repositorio Git
   si tienes uno) — no hace falta build, es un sitio estático.
3. Cloudflare te entrega una URL tipo `lloope.pages.dev` funcionando con HTTPS automático.
4. Conecta tu dominio propio (sección 4).

---

## 4. Conectar el dominio lloope.cl (comprado en NIC.cl)

Tienes dos caminos. Ambos funcionan; el primero es el que recomiendo porque además habilita
Cloudflare Access gratis para proteger el panel admin.

### Opción A (recomendada): delegar los nameservers a Cloudflare
1. En Cloudflare, agrega `lloope.cl` como sitio → te entrega 2 nameservers propios.
2. Entra a tu cuenta en **NIC.cl** → administración del dominio `lloope.cl` → cambia los
   "servidores de nombre / nameservers" por los que te dio Cloudflare.
3. El cambio puede tardar algunas horas en propagarse. Cloudflare emite el certificado HTTPS
   automáticamente una vez detecta el dominio activo.
4. En el proyecto de Cloudflare Pages, agrega `lloope.cl` (y `www.lloope.cl` si quieres) como
   dominio personalizado. Cloudflare crea los registros DNS necesarios por ti.

### Opción B: mantener el DNS en NIC.cl, solo apuntar registros
Si prefieres no mover los nameservers, agrega en el panel de DNS de NIC.cl los registros que
tu hosting te indique (normalmente un `CNAME` para `www` hacia la URL que te da Cloudflare
Pages / Netlify, y un registro `A`/`ALIAS` para el dominio raíz `lloope.cl` si NIC.cl lo
soporta). Con esta opción **no** podrás usar Cloudflare Access para proteger el admin, salvo
que además actives el proxy de Cloudflare sobre esos registros.

---

## 5. Login del panel admin y cuentas de cliente (ya implementado con Supabase)

### Qué cambió
El login del panel (`admin.html`) y las cuentas de cliente ("Mi cuenta" en `index.html` y
`cart.html`) **ya no son un mockup**: usan **Supabase Auth** real, consumido directamente
desde el navegador con **Row Level Security (RLS)** — sin backend propio ni funciones
serverless que mantener. Un cliente puede crear su cuenta, iniciar sesión la próxima vez, y
ver sus compras y el estado de cada una en "Mis pedidos". El admin puede actualizar ese estado
desde el panel y el cliente lo ve reflejado.

Mientras no configures tu proyecto de Supabase (pasos abajo), el sitio sigue funcionando
exactamente como antes de este cambio: "Mi cuenta" muestra el perfil de invitado sin
contraseña de siempre, y `/admin.html` te avisa claramente en la pantalla de login que falta
conectar el backend — no queda un login roto ni una contraseña hardcodeada visible.

### Cómo configurarlo
1. Crea una cuenta y un proyecto gratis en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta este script (crea las tablas `profiles` y `orders`, y las
   políticas de seguridad que hacen que cada cliente solo pueda ver sus propios pedidos,
   y que solo un admin pueda ver y actualizar todos):

   ```sql
   create table profiles (
     id uuid primary key references auth.users(id) on delete cascade,
     role text not null default 'customer' check (role in ('customer','admin','sysadmin'))
   );
   alter table profiles enable row level security;
   create policy "Cada usuario lee su propio rol" on profiles
     for select using (auth.uid() = id);

   create function public.handle_new_user() returns trigger as $$
   begin
     insert into public.profiles (id, role) values (new.id, 'customer');
     return new;
   end; $$ language plpgsql security definer;
   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute procedure public.handle_new_user();

   create table orders (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id),
     customer text, phone text, email text,
     items jsonb not null,
     total integer not null,
     pay_method text, pay_status text default 'Pendiente de pago',
     status text not null default 'Nuevo',
     notes text,
     created_at timestamptz not null default now()
   );
   alter table orders enable row level security;
   create policy "Cliente ve sus propios pedidos" on orders
     for select using (auth.uid() = user_id);
   create policy "Cliente crea su propio pedido" on orders
     for insert with check (auth.uid() = user_id);
   create policy "Admin ve todos los pedidos" on orders
     for select using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','sysadmin')));
   create policy "Admin actualiza cualquier pedido" on orders
     for update using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','sysadmin')));
   ```

3. Crea tu usuario admin en **Authentication → Users → Add user** (correo + contraseña que
   usarás para entrar a `/admin.html`).
4. En **Table Editor → profiles**, busca la fila con el `id` de ese usuario y cambia su
   columna `role` de `customer` a `admin`.
5. Copia el **Project URL** y la **anon public key** (**Settings → API**). No los pegues en
   ningún archivo de código: ábrelos en `/admin.html` (la pantalla de login te deja pegarlos
   ahí mismo la primera vez) o, ya logueado, en **Ajustes → Integraciones**. La anon key es
   segura de usar en el navegador — la protección real la dan las políticas RLS del paso 2;
   nunca uses la `service_role` key en el frontend.
6. Guarda y presiona **"Publicar cambios"** en el panel para que estos datos también lleguen
   a `data/store.json` (igual que el resto del contenido) — sin publicar, solo tu propio
   navegador vería la configuración. Ya puedes iniciar sesión en `/admin.html` con el usuario
   del paso 3, y tus clientes pueden crear cuenta y ver sus
   pedidos desde "Mi cuenta".

### Qué sigue siendo mockup
El resto del contenido de la tienda (productos, textos, imágenes, banners, cupones, etc.)
sigue funcionando como se explica en la sección 2: se edita en el panel, se guarda en
`localStorage`, y se publica manualmente con "Publicar cambios". Solo las **cuentas de
cliente** y los **pedidos** usan ahora una base de datos real. Los pedidos de checkout de
**invitado** (sin cuenta) siguen funcionando solo por WhatsApp, sin quedar registrados en
ningún lado — igual que en toda la v1 anterior a este cambio.

Si por alguna razón prefieres una capa de protección adicional sobre `/admin.html` (por
ejemplo, mientras terminas de configurar Supabase), **Cloudflare Access** o **Netlify
Identity** siguen siendo buenas opciones gratuitas — ver la documentación de tu hosting.

---

## 6. Cómo manejar los datos sin base de datos

| Dato | Dónde vive hoy | ¿Sirve para producción? |
|---|---|---|
| Catálogo, banners, cupones, contacto, textos, configuración | `data/store.json` (publicado) | **Sí**, mientras cambie con poca frecuencia (lo editas y publicas cuando corresponde). Es la solución correcta para el tamaño actual del proyecto. |
| Borrador de edición del admin | `localStorage` del navegador del admin | Solo como espacio de trabajo antes de publicar. **Nunca** como fuente pública. |
| Cuentas de cliente y pedidos | **Supabase** (Postgres + Auth), si lo configuraste en Ajustes → Integraciones (panel admin) | **Sí** — es una base de datos real, compartida entre el admin y los clientes. Ver sección 5. Si no lo configuras, sigue siendo mockup (perfil de invitado sin pedidos). |
| Usuarios administradores (equipo, roles — sección "Usuarios" del panel) | `localStorage` del navegador del admin | Solo demo/registro manual. No otorgan acceso real al panel — el acceso real ya lo controla Supabase Auth (sección 5). |

**Cuándo pasar el resto del contenido a una base de datos real también:** cuando quieras que
los cambios de catálogo se vean sin tener que "publicar" manualmente, que varias personas
editen a la vez desde distintos computadores, o cuando actives pagos automáticos. Ya tienes
Supabase conectado para cuentas/pedidos (sección 5) — extenderlo a productos/categorías es el
siguiente paso natural cuando llegue ese momento.

---

## 7. Concurrencia y stock — por qué es imposible resolverlo 100% sin backend

Preguntaste específicamente por esto y merece una respuesta clara: **con un sitio estático
(HTML/CSS/JS sin servidor propio) es imposible evitar por completo que dos personas "reserven"
al mismo tiempo la última unidad de un producto.** No es un descuido — es una limitación física
de la arquitectura: cada visitante tiene su propia copia de los datos en su propio navegador, y
ninguna de esas copias sabe lo que está haciendo la otra en tiempo real.

**Qué hace esta v1 para mitigarlo (no para eliminarlo):**
- El checkout es por **WhatsApp**, no un cobro automático. Quien confirma la venta final eres
  **tú**, revisando disponibilidad real antes de aceptar el pedido — ese es hoy el freno real
  contra la sobreventa.
- El carrito no deja agregar más unidades de las que el stock mostrado permite.
- Cada mensaje de pedido por WhatsApp incluye la frase *"Este pedido queda sujeto a
  confirmación de stock y disponibilidad"*, para dejarlo explícito con el cliente.

**Qué se necesita para resolverlo de verdad (fase 2, con pagos automáticos activos):** un
backend con una base de datos que soporte **transacciones atómicas** — una operación que revise
y descuente el stock en un solo paso indivisible, de forma que si dos compras llegan al mismo
tiempo, una gane y la otra sea rechazada automáticamente. Ejemplo con Supabase/Postgres:

```sql
-- Esto se ejecuta en el backend, nunca en el navegador del cliente.
UPDATE productos
SET stock = stock - :cantidad
WHERE id = :producto_id AND stock >= :cantidad
RETURNING stock;
-- Si no se actualiza ninguna fila, significa que ya no había stock suficiente:
-- el backend rechaza la compra ANTES de cobrar.
```

Con Firebase/Firestore el equivalente es una `runTransaction()`, que hace exactamente lo mismo:
leer y escribir el stock como una sola operación que no se puede interrumpir a la mitad.

**En resumen:** hoy el freno es humano (tú, por WhatsApp); en fase 2 el freno es la base de
datos, automático e instantáneo.

---

## 8. Cupón de bienvenida, leads, boleta/factura y "cuentas" de cliente

### Captura de correos (pop-up de salida)
El pop-up de bienvenida guarda el correo capturado en `localStorage`, **solo en el navegador
de esa visita**. Esto significa que **a ti no te llega ese correo** — no hay ningún envío real
todavía. Para que los leads te lleguen de verdad, hay que conectar un servicio de formularios o
correo (todos con plan gratuito para volúmenes bajos):

- **EmailJS**: envía un correo directamente desde el navegador sin backend propio.
- **Formspree / Getform**: reciben el POST del formulario y te notifican por correo.
- **Brevo (ex Sendinblue)**: además de recibir el lead, te deja agregarlo a una lista de
  newsletter automáticamente.

En `index.html`, la función `submitLead(email)` es el único punto de conexión: hoy solo llama
a `Lloope.addLead(email)` (guardado local). Cuando tengas cuenta en uno de esos servicios,
agregas ahí la llamada `fetch(...)` correspondiente — es un cambio de pocas líneas, no un
rediseño. Mientras tanto, el panel admin (Cupones → "Leads capturados en este navegador")
muestra los correos capturados **solo si los revisas desde el mismo navegador/dispositivo**
donde el visitante los dejó — útil para probar, no para operar de verdad.

### Boleta y factura
El selector Boleta/Factura de `cart.html` (activable en Carrito → "Permitir solicitar factura")
**no emite ningún documento tributario**. Solo recopila RUT, razón social, giro y dirección y
los incluye en el mensaje de WhatsApp para que tú generes la boleta o factura real con tu propio
sistema de facturación. La emisión de documentos tributarios electrónicos en Chile requiere un
proveedor autorizado por el **SII** (o el propio portal del SII para volúmenes bajos) — eso es
un sistema aparte, no algo que un sitio estático pueda hacer por sí mismo.

### "Cuenta" del cliente
Si configuraste Supabase (sección 5), el ícono de cuenta en el header **es un login real**:
el cliente crea su cuenta con correo y contraseña, inicia sesión la próxima vez desde
cualquier dispositivo, y ve sus pedidos y el estado de cada uno en "Mis pedidos".

Si **no** configuraste Supabase todavía, el ícono de cuenta vuelve al comportamiento original:
guarda nombre/correo/teléfono en `localStorage` del navegador del cliente para precargar esos
datos en su próxima compra (igual que un formulario "recordar mis datos"), sin contraseña ni
historial de pedidos.

---

## 9. Checklist antes de anunciar el sitio

- [ ] Reemplazar el número de WhatsApp de ejemplo (`56912345678`) por el real, en **Contacto**.
- [ ] Reemplazar el correo de ejemplo (`hola@lloope.cl`) por el real.
- [ ] Revisar los datos bancarios de ejemplo en **Pagos → Transferencia bancaria**.
- [ ] Revisar/editar los **Textos legales** (términos, devoluciones, despacho).
- [ ] Confirmar que **Pagos** refleje los medios que realmente vas a ofrecer al lanzar.
- [ ] Si activas el pop-up de bienvenida, conectar un servicio real de captura de leads
      (EmailJS / Formspree / Brevo) — de lo contrario, esos correos no te llegan (sección 8).
- [ ] Publicar cambios (`Publicar cambios` → subir `store.json`) y probar el sitio ya en
      `lloope.cl`, no solo en tu computador.
- [ ] Probar el sitio en un celular real (no solo en el navegador de escritorio).
- [ ] Configurar Supabase (sección 5) y pegar tu URL/anon key en la pantalla de login de
      `/admin.html` o en Ajustes → Integraciones — sin esto, `/admin.html` no deja iniciar
      sesión y los clientes no pueden crear cuenta ni ver pedidos.
- [ ] Crear tu usuario admin en Supabase y confirmar que puedes entrar a `/admin.html` con él
      antes de compartir el dominio públicamente.
- [ ] Guardar en un lugar seguro (no en el navegador) una copia de `store.json` como respaldo.

---

## 10. Roadmap fase 2 (cuando quieras pagos y pedidos 100% automáticos)

✅ **Ya implementado** (sección 5): cuentas de cliente reales, "Mis pedidos" con estado, y
login real del panel admin — todo vía Supabase Auth + Postgres, sin backend propio. Lo que
sigue pendiente de esta lista es principalmente **pagos automáticos** y **stock/transacciones**.

- **Backend dedicado**: no es necesario solo para lo de arriba (Supabase ya lo resuelve sin
  servidor propio). Se vuelve necesario si más adelante necesitas lógica de negocio compleja
  que no se pueda expresar con políticas RLS — por ahora, Node.js + NestJS/Express, Laravel o
  Spring Boot seguirían siendo las opciones naturales si llega ese momento.
- **Imágenes**: Cloudinary, Amazon S3, o almacenamiento propio del servidor — no más base64 en
  el navegador.
- **Pagos reales**: integración con **Webpay (Transbank)**, **Mercado Pago** o **Flow**, con
  la confirmación del pago validada **desde el backend** (nunca confiar en lo que diga el
  navegador del comprador).
- **Variables de entorno** para todas las llaves privadas (nunca en el código del frontend).
- **HTTPS obligatorio** en todo el sitio (ya lo da Cloudflare Pages/Netlify de forma gratuita).
- **Stock y pedidos con transacciones atómicas** (ver sección 7).
- **Panel protegido por roles** reales a nivel de backend (Administrador / Editor / Vendedor).
- **Backups automáticos** de la base de datos.
