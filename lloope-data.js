/* =============================================================================
   LLOOPE · Capa de datos compartida
   -----------------------------------------------------------------------------
   admin.html EDITA siempre en localStorage (es su borrador de trabajo).
   index.html (la tienda pública) LEE en este orden de prioridad:
     1. data/store.json  → el archivo publicado, lo que ven TODOS los visitantes.
     2. localStorage      → solo sirve si admin.html e index.html se abren en el
                             MISMO navegador (útil para previsualizar cambios).
     3. LLOOPE_DEFAULTS   → datos de ejemplo, red de seguridad sin nada guardado.

   ⚠️ localStorage es por navegador/dispositivo, NO se comparte entre visitantes.
   Por eso existe el botón "Publicar cambios" en el panel: genera data/store.json
   para subirlo al hosting y que el cambio se vea igual para todos. Ver PRODUCCION.md.

   ⚠️  IMPORTANTE (versión real de backend):
   El contenido de la tienda (productos, textos, imágenes, etc.) sigue siendo
   un MOCKUP sin servidor propio, tal como se explica arriba.
   Las CUENTAS DE CLIENTE y los PEDIDOS ya no son mockup si se configura
   LLOOPE_SUPABASE más abajo: en ese caso usan Supabase (Postgres + Auth) real,
   consumido directamente desde el navegador con Row Level Security — sin
   backend propio ni funciones serverless. Ver Lloope.auth y PRODUCCION.md.
     - Guardar imágenes en Cloudinary / S3 / servidor, no como base64.
     - Nunca exponer llaves privadas de pagos en el frontend.
     - El stock y los pagos reales requieren un backend con transacciones atómicas
       (ver la sección "Concurrencia" de PRODUCCION.md).
============================================================================= */

const LLOOPE_KEYS = {
  settings:  "lloope_settings",
  home:      "lloope_home",
  menu:      "lloope_menu",
  products:  "lloope_products",
  categories:"lloope_categories",
  images:    "lloope_images",
  contact:   "lloope_contact",
  cart:      "lloope_cart_config",
  payment:   "lloope_payment_config",
  orders:    "lloope_orders",
  legal:     "lloope_legal_texts",
  users:     "lloope_users",
  coupons:   "lloope_coupons",
  banners:   "lloope_banners",
  corpLogos:    "lloope_corp_logos",
  faq:          "lloope_faq",
  fieldOptions: "lloope_field_options",
  welcomePopup: "lloope_welcome_popup",
  supabase:  "lloope_supabase_config", // ver sección SUPABASE más abajo
  session:   "lloope_admin_session"   // ya no se usa (login real es Supabase Auth), queda por compatibilidad
};

/* Llaves que SÍ se incluyen en data/store.json (contenido público del sitio).
   orders y users quedan fuera por contener datos sensibles/privados, y dentro
   de "payment" se elimina secretKey antes de publicar (ver Lloope.publish).
   "supabase" SÍ se publica a propósito: la anon key está diseñada para ser
   pública (la protección real la da RLS) y los visitantes reales necesitan
   estos datos para poder crear cuenta e iniciar sesión — ver Lloope.auth. */
const LLOOPE_PUBLIC_KEYS = ['settings','home','menu','products','categories','images','contact','cart','payment','legal','coupons','banners','corpLogos','faq','fieldOptions','welcomePopup','supabase'];

/* Llaves de estado del VISITANTE (no del admin): carrito en curso, perfil de
   invitado recordado y leads capturados por el pop-up de salida. Viven fuera
   de LLOOPE_KEYS porque no son "contenido administrable" sino datos propios
   de cada navegador de cliente. */
const LLOOPE_CLIENT_KEYS = {
  cartSession: "lloope_cart_session",
  profile:     "lloope_customer_profile",
  leads:       "lloope_leads"
};

/* ---------------------------------------------------------------------------
   SUPABASE (cuentas de cliente reales + pedidos + login real de admin).
   La URL y la anon public key de tu proyecto de Supabase (Settings → API) se
   configuran DESDE EL PANEL ADMIN (Ajustes → Integraciones), igual que el
   resto de la configuración de la tienda — no se edita código para esto.
   La anon key es segura de usar en el navegador y de publicarse en
   data/store.json: la protección real la da Row Level Security en la base de
   datos, nunca la service_role key (esa jamás debe ir en el frontend).
   Mientras no se configure, el sitio sigue funcionando igual que antes
   (perfil de invitado sin cuenta real) — ver Lloope.auth.isConfigured().
--------------------------------------------------------------------------- */
const LLOOPE_ORDER_STATES = ['Nuevo','En revisión','Pendiente de pago','Pagado','En fabricación','Listo para entrega','Entregado','Cancelado'];

/* SQL de configuración inicial en Supabase (tablas profiles/orders + RLS).
   Se muestra también en el panel admin (Ajustes → Integraciones) para no
   tener que buscarlo en PRODUCCION.md. Mantener ambas copias sincronizadas
   si se edita. */
const LLOOPE_SUPABASE_SQL = `create table profiles (
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
  for update using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','sysadmin')));`;

const LLOOPE_MP_MIGRATION_SQL = `-- Mercado Pago: columnas extra en orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_external_ref ON orders (external_reference);`;

/* ---------------------------------------------------------------------------
   DATOS DE EJEMPLO (semilla). Si no hay nada en localStorage se cargan estos.
--------------------------------------------------------------------------- */
const LLOOPE_DEFAULTS = {

  settings: {
    storeName: "Lloope",
    tagline: "Diseños en madera",
    logo: "img/logo-mark.png",
    colorPrimary: "#B06B3E",   // madera
    colorSecondary: "#7E8B69", // salvia
    colorButton: "#2B211A",    // espresso
    font: "Manrope",
    currency: "CLP",
    ivaIncluded: true,
    footerMessage: "Diseños y productos decorativos en madera, hechos con corte CNC y terminaciones artesanales. Piezas únicas para tu hogar, tus regalos y tu marca.",
    status: "active"           // "active" | "maintenance"
  },

  home: {
    heroEyebrow: "Emprendimiento chileno · Madera + CNC",
    heroTitle: "La madera cobra vida propia en cada corte.",
    heroHighlight: "vida propia",
    heroSubtitle: "Diseños decorativos, tablas y regalos personalizados creados con precisión CNC y terminaciones hechas a mano. Piezas únicas, cálidas y con historia.",
    heroCtaText: "Explorar catálogo",
    heroCtaLink: "#catalogo",
    heroImage: "img/bandeja-cereza.jpeg",
    heroFloatImage: "img/letrero-boda.jpeg",
    heroBadge: "Madera noble seleccionada",
    showFeatured: true,
    showAbout: true,
    showGallery: true,
    showContact: true
  },

  menu: [
    { id: 1, label: "Catálogo",     link: "#catalogo",    order: 1, active: true },
    { id: 2, label: "Categorías",   link: "#categorias",  order: 2, active: true },
    { id: 3, label: "Proceso",      link: "#proceso",     order: 3, active: true },
    { id: 4, label: "Sobre Lloope", link: "#nosotros",    order: 4, active: true },
    { id: 5, label: "A pedido",     link: "#corporativo", order: 5, active: true },
    { id: 6, label: "Contacto",     link: "#contacto",    order: 6, active: true }
  ],

  categories: [
    { id: 1, name: "Tablas y bandejas",     image: "img/tabla-asado.jpeg",          order: 1, active: true },
    { id: 2, name: "Decoración en madera",  image: "img/panel-tropical.jpeg",       order: 2, active: true },
    { id: 3, name: "Regalos personalizados",image: "img/figura-personalizada.jpeg", order: 3, active: true },
    { id: 4, name: "Diseños a pedido",      image: "img/corporativo-vina.jpeg",     order: 4, active: true }
  ],

  products: [
    { id:1, name:"Tabla de picoteo grabada", sku:"LLP-001", cat:"Tablas y bandejas", price:24990, offerPrice:0, stock:12, active:true, featured:true, custom:false, quote:false,
      descShort:"Tabla de madera noble con manillas y canal jugo. Ideal para asados y picoteos.",
      descLong:"Tabla de madera noble con manillas laterales y canal para jugos. Perfecta para asados y tablas de picoteo; se personaliza con nombre o logo grabado.",
      measures:"45 × 25 cm", material:"Raulí / madera nativa", fabTime:"5 a 7 días", image:"img/tabla-asado.jpeg", gallery:[] },
    { id:2, name:"Bandeja Dinosaurio", sku:"LLP-002", cat:"Tablas y bandejas", price:16990, offerPrice:0, stock:8, active:true, featured:false, custom:false, quote:false,
      descShort:"Bandeja tallada en forma de triceratops. Divertida y decorativa para niños.",
      descLong:"Bandeja tallada en forma de triceratops. Un plato divertido y decorativo, ideal para niños y coleccionistas. Terminación con aceite seguro al contacto.",
      measures:"30 × 18 cm", material:"Madera de álamo", fabTime:"4 a 6 días", image:"img/bandeja-dinosaurio.jpeg", gallery:[] },
    { id:3, name:"Bandeja Cerezas", sku:"LLP-003", cat:"Tablas y bandejas", price:18990, offerPrice:15990, stock:10, active:true, featured:true, custom:false, quote:false,
      descShort:"Bandeja con doble cavidad en forma de cerezas. Perfecta para snacks o salsas.",
      descLong:"Bandeja con doble cavidad en forma de cerezas. Perfecta para snacks, salsas o como pieza decorativa sobre la mesa.",
      measures:"28 × 26 cm", material:"Madera nativa", fabTime:"5 a 7 días", image:"img/bandeja-cereza.jpeg", gallery:[] },
    { id:4, name:"Tabla Guitarra", sku:"LLP-004", cat:"Tablas y bandejas", price:27990, offerPrice:0, stock:5, active:true, featured:false, custom:false, quote:false,
      descShort:"Tabla de servir con silueta de guitarra y divisiones. Para amantes de la música.",
      descLong:"Tabla de servir con silueta de guitarra y divisiones internas. Para los amantes de la música y el buen picoteo.",
      measures:"50 × 22 cm", material:"Raulí", fabTime:"6 a 8 días", image:"img/tabla-guitarra.jpeg", gallery:[] },
    { id:5, name:"Letrero Mi Bautizo", sku:"LLP-005", cat:"Regalos personalizados", price:19990, offerPrice:0, stock:15, active:true, featured:true, custom:true, quote:false,
      descShort:"Letrero circular calado para bautizos. Se personaliza con nombre y fecha.",
      descLong:"Letrero circular calado para bautizos. Se personaliza con el nombre y la fecha del recuerdo. Liviano y perfecto como decoración o fondo de fotos.",
      measures:"40 cm diámetro", material:"MDF sellado", fabTime:"3 a 5 días", image:"img/letrero-bautizo.jpeg", gallery:[] },
    { id:6, name:"Letrero Baby Shower", sku:"LLP-006", cat:"Regalos personalizados", price:19990, offerPrice:0, stock:0, active:true, featured:false, custom:true, quote:false,
      descShort:"Aro decorativo Baby Shower en madera. Ideal como fondo de fotos.",
      descLong:"Aro decorativo Baby Shower en madera calada. Ideal como fondo de fotos y decoración de evento. Reutilizable.",
      measures:"40 cm diámetro", material:"MDF sellado", fabTime:"3 a 5 días", image:"img/letrero-baby-shower.jpeg", gallery:[] },
    { id:7, name:"Letrero Nuestra Boda", sku:"LLP-007", cat:"Regalos personalizados", price:22990, offerPrice:0, stock:9, active:true, featured:true, custom:true, quote:false,
      descShort:"Letrero circular para matrimonios y sesiones de fotos. Elegante y reutilizable.",
      descLong:"Letrero circular para matrimonios y sesiones de fotos. Elegante, liviano y reutilizable; se personaliza con nombres y fecha.",
      measures:"45 cm diámetro", material:"MDF sellado", fabTime:"4 a 6 días", image:"img/letrero-boda.jpeg", gallery:[] },
    { id:8, name:"Figura personalizada con nombre", sku:"LLP-008", cat:"Regalos personalizados", price:21990, offerPrice:0, stock:7, active:true, featured:false, custom:true, quote:false,
      descShort:"Figura decorativa de madera con nombre grabado. Un regalo emotivo.",
      descLong:"Figura decorativa de madera con nombre grabado. Un regalo emotivo para amantes de las mascotas y fechas especiales.",
      measures:"15 × 12 cm", material:"MDF / madera nativa", fabTime:"4 a 6 días", image:"img/figura-personalizada.jpeg", gallery:[] },
    { id:9, name:"Set Bandejas Trébol", sku:"LLP-009", cat:"Decoración en madera", price:29990, offerPrice:0, stock:6, active:true, featured:true, custom:false, quote:false,
      descShort:"Trío de bandejas con forma de trébol que encajan entre sí.",
      descLong:"Trío de bandejas con forma de trébol que encajan entre sí. Decorativas y funcionales, ideales para picoteos y regalos.",
      measures:"3 piezas · 20 cm c/u", material:"Madera nativa", fabTime:"6 a 8 días", image:"img/bandejas-flor.jpeg", gallery:[] },
    { id:10, name:"Bandeja Conejo", sku:"LLP-010", cat:"Decoración en madera", price:14990, offerPrice:0, stock:11, active:true, featured:false, custom:false, quote:false,
      descShort:"Bandeja ovalada con silueta de conejo tallada en madera clara.",
      descLong:"Bandeja ovalada con silueta de conejo tallada en madera clara. Suave, cálida y minimalista.",
      measures:"26 × 16 cm", material:"Madera de álamo", fabTime:"4 a 6 días", image:"img/bandeja-conejo.jpeg", gallery:[] },
    { id:11, name:"Letrero de Parcela personalizado", sku:"LLP-011", cat:"Diseños a pedido", price:34990, offerPrice:0, stock:4, active:true, featured:true, custom:true, quote:false,
      descShort:"Letrero rústico para parcelas y casas de campo, con nombre a elección.",
      descLong:"Letrero rústico para parcelas y casas de campo, con nombre y detalles a elección. Terminación resistente para exterior.",
      measures:"80 × 35 cm", material:"Madera tratada", fabTime:"7 a 10 días", image:"img/letrero-parcela.jpeg", gallery:[] },
    { id:12, name:"Repisa infantil de libros", sku:"LLP-012", cat:"Decoración en madera", price:49990, offerPrice:0, stock:3, active:true, featured:false, custom:false, quote:false,
      descShort:"Organizador de libros tipo Montessori en madera. Estable y seguro.",
      descLong:"Organizador de libros tipo Montessori en madera. Estable, seguro y de líneas suaves; pensado para la habitación de los niños.",
      measures:"60 × 65 cm", material:"Terciado / MDF", fabTime:"8 a 12 días", image:"img/repisa-infantil.jpeg", gallery:[] },
    { id:13, name:"Panel decorativo calado", sku:"LLP-013", cat:"Decoración en madera", price:59990, offerPrice:0, stock:0, active:true, featured:false, custom:true, quote:false,
      descShort:"Panel o biombo calado con diseño tropical. Perfecto para eventos.",
      descLong:"Panel o biombo calado con diseño tropical. Perfecto para eventos, fondos y decoración de interiores. Diseño personalizable.",
      measures:"120 × 200 cm", material:"MDF pintado", fabTime:"10 a 15 días", image:"img/panel-tropical.jpeg", gallery:[] },
    { id:14, name:"Diseño corporativo en madera", sku:"LLP-014", cat:"Diseños a pedido", price:0, offerPrice:0, stock:99, active:true, featured:false, custom:true, quote:true,
      descShort:"Tablas, bandejas y objetos con la identidad de tu marca. A cotizar.",
      descLong:"Tablas, bandejas y objetos con la identidad de tu marca. Cotización según proyecto, diseño y cantidad. Ideal para regalos institucionales y activaciones.",
      measures:"A medida", material:"A elección", fabTime:"Según proyecto", image:"img/corporativo-vina.jpeg", gallery:[] }
  ],

  images: {
    logo: "img/logo-mark.png",
    logoFull: "img/logo.png",
    hero: "img/bandeja-cereza.jpeg",
    gallery: [
      { id:1, src:"img/letrero-bautizo.jpeg",     alt:"Letrero Mi Bautizo en madera" },
      { id:2, src:"img/bandejas-flor.jpeg",        alt:"Set de bandejas con forma de flor" },
      { id:3, src:"img/corporativo-prize.jpeg",    alt:"Bandeja corporativa de cerezas Prizé" },
      { id:4, src:"img/letrero-parcela.jpeg",      alt:"Letrero rústico para parcela" },
      { id:5, src:"img/bandeja-conejo.jpeg",       alt:"Bandeja de madera con forma de conejo" },
      { id:6, src:"img/letrero-baby-shower.jpeg",  alt:"Letrero Baby Shower en madera" },
      { id:7, src:"img/repisa-infantil.jpeg",      alt:"Repisa infantil de libros en madera" },
      { id:8, src:"img/figura-mujer-gato.jpeg",    alt:"Figura decorativa mujer y mascota" }
    ]
  },

  contact: {
    businessName: "Lloope",
    phone: "+56 9 7567 4135",
    whatsapp: "56975674135",
    email: "hola@lloope.cl",
    instagram: "lloope.cl",
    tiktok: "",
    facebook: "",
    city: "Rengo, Región de O'Higgins",
    address: "",
    hours: "Lun a Sáb · 10:00 a 19:00 h",
    waMessage: "¡Hola Lloope! 🌿 Quiero hacer este pedido:",
    contactText: "¿Tienes una idea o quieres personalizar un producto? Escríbenos y la hacemos realidad."
  },

  cart: {
    enabled: true,
    currency: "CLP",
    minPurchase: 0,
    shippingCost: 0,
    pickup: true,
    homeDelivery: true,
    shippingByPayer: true,
    finishMessage: "¡Gracias por tu pedido! Te contactaremos por WhatsApp para coordinar personalización y despacho.",
    whatsappCheckout: true,
    onlinePay: false,
    allowInvoice: false,
    btnAddToCart: "Agregar al carrito",
    btnViewCart: "Ver carrito",
    btnCheckout: "Finalizar compra",
    btnWhatsapp: "Comprar por WhatsApp"
  },

  payment: {
    methods: { transfer:true, whatsapp:true, webpay:false, mercadopago:false, flow:false, other:false },
    transfer: { bank:"Banco Estado", accountType:"Cuenta Vista", accountNumber:"00012345678", holder:"Lloope SpA", rut:"77.123.456-7", email:"pagos@lloope.cl" },
    online: { provider:"Webpay", mode:"test", publicKey:"", secretKey:"", commerceCode:"", returnUrl:"", confirmUrl:"", active:false },
    mercadoPago: { publicKey:"", mode:"test" }
  },

  orders: [
    { id:"LLP-1003", date:"2026-06-30", customer:"María González", phone:"+56 9 8888 1111", email:"maria@correo.cl",
      items:[{name:"Letrero Nuestra Boda", qty:1, price:22990},{name:"Figura personalizada con nombre", qty:2, price:21990}],
      total:66970, payMethod:"Transferencia bancaria", payStatus:"Pagado", delivery:"Envío a domicilio", status:"En fabricación", notes:"Grabar nombres: Ana & Diego · 12/2026" },
    { id:"LLP-1002", date:"2026-06-28", customer:"Rodrigo Pérez", phone:"+56 9 7777 2222", email:"rodrigo@correo.cl",
      items:[{name:"Tabla de picoteo grabada", qty:1, price:24990}],
      total:24990, payMethod:"Pago por WhatsApp", payStatus:"Pendiente de pago", delivery:"Retiro en taller", status:"Pendiente de pago", notes:"Logo empresa Los Andes" },
    { id:"LLP-1001", date:"2026-06-25", customer:"Camila Soto", phone:"+56 9 6666 3333", email:"camila@correo.cl",
      items:[{name:"Bandeja Cerezas", qty:1, price:15990},{name:"Bandeja Conejo", qty:1, price:14990}],
      total:30980, payMethod:"Transferencia bancaria", payStatus:"Pagado", delivery:"Envío a domicilio", status:"Entregado", notes:"" }
  ],

  legal: {
    terms: "Los productos de Lloope son elaborados de forma artesanal, por lo que pueden existir pequeñas variaciones en color y veta de la madera. Al realizar un pedido aceptas nuestros tiempos de fabricación y condiciones de personalización.",
    privacy: "Tus datos se utilizan únicamente para gestionar tu pedido y contacto. No compartimos tu información con terceros.",
    returns: "Los productos personalizados no tienen cambio ni devolución, salvo defecto de fabricación. Para productos de catálogo, tienes 7 días desde la recepción para solicitar cambio.",
    shipping: "Realizamos envíos a todo Chile mediante courier. El costo y plazo se coordinan por WhatsApp según ciudad y tamaño de la pieza. También ofrecemos retiro en taller.",
    iva: "Todos los precios incluyen IVA.",
    secure: "Compra segura: no almacenamos datos de tarjetas. Los pagos con tarjeta se procesan mediante proveedores externos certificados.",
    dataRights: "Dónde viven tus datos: el carrito, tu perfil de invitado (nombre, correo, teléfono) y el correo que dejas en el pop-up de descuento se guardan únicamente en el navegador de tu propio dispositivo. No están en un servidor central.\n\nPerfil de invitado: puedes ver, editar o eliminar estos datos tú mismo en cualquier momento desde el ícono \"Mi cuenta\" → \"Olvidar mis datos\".\n\nCorreo del pop-up de descuento y pedidos confirmados por WhatsApp: quedan como registro en el dispositivo donde se administra la tienda. Para solicitar acceso, corrección o eliminación de estos datos, contáctanos directamente y responderemos en un plazo máximo de 30 días.\n\nDatos de pago: este sitio no pide ni almacena números de tarjeta, CVV ni fecha de vencimiento en ningún caso."
  },

  users: [
    { id:1, name:"Administrador Lloope", email:"admin@lloope.cl",  role:"Administrador", active:true },
    { id:2, name:"Editor de contenido",  email:"editor@lloope.cl", role:"Editor",        active:true },
    { id:3, name:"Equipo de ventas",     email:"ventas@lloope.cl", role:"Vendedor",      active:false }
  ],

  coupons: [
    { id:1, code:"BIENVENIDO10", type:"percent", value:10, startDate:"2026-01-01", endDate:"2026-12-31", active:true, singleUse:false },
    { id:2, code:"ENVIOGRATIS",  type:"fixed",   value:5000, startDate:"2026-01-01", endDate:"2026-12-31", active:false, singleUse:false }
  ],

  banners: [
    { id:1, title:"Cyber Days Lloope", text:"20% de descuento en piezas seleccionadas con el código BIENVENIDO10.",
      image:"", bgColor:"#8A4E2C", buttonText:"Ver catálogo", buttonLink:"#catalogo",
      startDate:"2026-01-01", endDate:"2026-12-31", active:false }
  ],

  /* Carrusel de "marcas que confían en Lloope" en la sección Corporativo.
     url vacío = el logo no es clickeable (solo se ve el tooltip con el nombre). */
  corpLogos: [
    { id:1, name:"Viña La Torina",    image:"img/logo_vina_la_torina.jpg",    url:"", active:true },
    { id:2, name:"Prizé Superfruits", image:"img/logo_prize.png",             url:"", active:true },
    { id:3, name:"Agrosuper",         image:"img/logo_agrosuper.png",         url:"", active:true },
    { id:4, name:"Quebranta",         image:"img/logo_quebranta.jpg",         url:"", active:true },
    { id:5, name:"Vamos ONG Chile",   image:"img/logo_vamosong_chile.png",    url:"", active:true },
    { id:6, name:"Cercotec Rancagua", image:"img/logo_cercotec_rancagua.png", url:"", active:true },
    { id:7, name:"Colegio Antilén",   image:"img/loco_colegio_antilen.png",   url:"", active:true }
  ],

  /* Preguntas frecuentes generales de la tienda (página faq.html, enlazada
     desde el footer). Distintas del FAQ por producto (campo "faq" de cada
     producto), que responde dudas específicas de esa pieza. */
  faq: [
    { id:1, q:"¿Cómo cuido mi pieza de madera?", a:"Limpia con paño húmedo, evita remojarla. Para tablas de cocina, aplica aceite de coco o mineral cada cierto tiempo. No lavar en lavavajillas.", active:true },
    { id:2, q:"¿Cómo se hace el envío?", a:"Despachamos a todo Chile. Coordinamos el envío por WhatsApp una vez confirmado el pedido. El costo de despacho depende de tu ubicación.", active:true }
  ],

  /* Listas de sugerencias para los campos de producto (combobox editable).
     El admin puede escribir valores personalizados además de estos. */
  fieldOptions: {
    material: [
      'MDF 9mm','MDF 15mm','MDF 18mm',
      'Pino radiata','Pino cepillado',
      'Coigüe','Roble nacional','Eucalipto','Lenga',
      'Triplay 15mm','Triplay 18mm',
      'Melamina blanca','Melamina color'
    ],
    measures: [
      '20 × 15 cm','30 × 20 cm','45 × 25 cm',
      '60 × 30 cm','60 × 40 cm','80 × 40 cm',
      '100 × 50 cm','120 × 60 cm'
    ],
    fabTime: [
      '1 a 3 días','3 a 5 días','5 a 7 días',
      '7 a 10 días','10 a 15 días','15 a 20 días',
      '20 a 30 días'
    ]
  },

  welcomePopup: {
    enabled: false,
    title: "¡Espera! Un regalo para ti",
    text: "Déjanos tu correo y obtén un descuento especial para tu primera compra en Lloope.",
    badgeText: "10% OFF",
    image: "",
    couponCode: "BIENVENIDO10",
    buttonText: "Quiero mi descuento"
  },

  /* Vacío por defecto: se configura desde el panel (Ajustes → Integraciones),
     no editando este archivo. Ver Lloope.auth. */
  supabase: { url: "", anonKey: "" }
};

/* ---------------------------------------------------------------------------
   CUENTAS DE CLIENTE + PEDIDOS REALES (Supabase), consumido directamente
   desde el navegador vía su SDK JS. Sin funciones serverless: la seguridad
   la da Row Level Security (cada cliente solo puede leer/crear SUS propios
   pedidos; solo un usuario con role="admin" en la tabla `profiles` puede
   ver/editar todos). Ver PRODUCCION.md para el SQL de configuración inicial.
   Todos los métodos son best-effort: si no está configurado o falla la carga
   del SDK, devuelven {error:'not_configured'} en vez de lanzar una excepción,
   para que el resto del sitio siga funcionando.

   ¿De dónde sale la configuración (url/anonKey)?
   - admin.html la lee directo de localStorage (Lloope.get('supabase')): ahí
     es donde el propio admin la guardó desde Ajustes → Integraciones.
   - index.html/cart.html (visitantes reales) deben llamar Lloope.auth.init()
     una vez en su boot(), pasándole DATA.supabase — el valor ya resuelto por
     Lloope.loadPublicData() con la prioridad store.json → localStorage. Sin
     este init(), caerían en su propio localStorage vacío y nunca verían la
     configuración que el admin publicó.
--------------------------------------------------------------------------- */
const LloopeAuth = {
  _client: null, _cfgKey: null, _cfg: null,

  /* Llamar una vez desde boot() en páginas públicas. No es necesario en
     admin.html (usa localStorage directo, ver comentario arriba). */
  init(cfg){ this._cfg = cfg || null; },

  _resolvedCfg(){ return this._cfg || Lloope.get('supabase'); },

  isConfigured(){
    const cfg=this._resolvedCfg();
    return !!(cfg && cfg.url && cfg.anonKey);
  },

  /* Método de acceso elegido por el admin para "Mi cuenta" en las páginas
     públicas: 'password' (correo+clave, de siempre), 'magiclink' (correo con
     botón, funciona con el correo gratis de Supabase) u 'otp' (código de 6
     dígitos — requiere SMTP propio en Supabase para que el correo muestre el
     código en vez del link). Default 'password' por compatibilidad. */
  authMethod(){
    const cfg=this._resolvedCfg();
    return (cfg && cfg.authMethod) || 'password';
  },

  client(){
    const cfg=this._resolvedCfg();
    if(!cfg || !cfg.url || !cfg.anonKey || typeof window.supabase === 'undefined') return null;
    const key=cfg.url+'|'+cfg.anonKey;
    if(this._client && this._cfgKey===key) return this._client;
    this._client=window.supabase.createClient(cfg.url, cfg.anonKey);
    this._cfgKey=key;
    return this._client;
  },

  async signUp(email, pass, name){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.signUp({ email, password:pass, options:{ data:{ name } } });
    return { data, error: error ? error.message : null };
  },
  async signIn(email, pass){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.signInWithPassword({ email, password:pass });
    return { data, error: error ? error.message : null };
  },
  /* "Olvidé mi contraseña": envía un link que, al abrirlo, vuelve a
     redirectTo con una sesión temporal de recuperación (Supabase agrega
     type=recovery al hash de la URL — así sabe la página que debe pedir
     una contraseña nueva en vez de tratarlo como login normal). */
  async sendPasswordReset(email, redirectTo){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
    return { data, error: error ? error.message : null };
  },
  /* Se llama con la sesión de recuperación activa (ver arriba) para fijar
     la contraseña nueva que el cliente escribió. */
  async updatePassword(newPassword){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.updateUser({ password:newPassword });
    return { data, error: error ? error.message : null };
  },
  /* Guarda datos de perfil (nombre, teléfono) en auth.users.user_metadata —
     mismo lugar donde ya vive "name" desde signUp. Así el checkout y
     "Mi perfil" quedan sincronizados vía Supabase (no localStorage), y se ven
     iguales desde cualquier dispositivo donde el cliente inicie sesión. */
  async updateUserMeta(meta){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.updateUser({ data: meta });
    return { data, error: error ? error.message : null };
  },
  /* Envía un magic link (correo con botón "Iniciar sesión") en vez de pedir
     contraseña. redirectTo debe ser la URL de vuelta a la propia tienda
     (normalmente window.location.href de la página que llama esto) para que
     Supabase redirija ahí con la sesión ya activa tras el clic. */
  async sendMagicLink(email, redirectTo){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo:redirectTo } });
    return { data, error: error ? error.message : null };
  },
  /* Envía un código de 6 dígitos por correo. Requiere que en Supabase →
     Authentication → Email Templates → "Magic Link or OTP" se use SMTP
     personalizado con {{ .Token }} en el cuerpo — el correo gratis de
     Supabase solo puede mandar un link, nunca el código. */
  async sendOtp(email){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } });
    return { data, error: error ? error.message : null };
  },
  async verifyOtp(email, token){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { data, error } = await c.auth.verifyOtp({ email, token, type:'email' });
    return { data, error: error ? error.message : null };
  },
  async signOut(){
    const c=this.client(); if(!c) return;
    await c.auth.signOut();
  },
  async getSession(){
    const c=this.client(); if(!c) return null;
    const { data } = await c.auth.getSession();
    return data.session;
  },
  onAuthChange(cb){
    const c=this.client(); if(!c) return;
    c.auth.onAuthStateChange((_event, session)=>cb(session));
  },

  /* ¿La sesión activa pertenece a un usuario con role="admin" en `profiles`? */
  async isAdmin(){
    const c=this.client(); if(!c) return false;
    const session=await this.getSession(); if(!session) return false;
    const { data, error } = await c.from('profiles').select('role').eq('id', session.user.id).single();
    return !error && data && ['admin','sysadmin'].includes(data.role);
  },
  async getRole(){
    const c=this.client(); if(!c) return null;
    const session=await this.getSession(); if(!session) return null;
    const { data, error } = await c.from('profiles').select('role').eq('id', session.user.id).single();
    return (!error && data) ? data.role : null;
  },

  /* Pedidos del cliente logueado (RLS solo deja ver los propios). */
  async myOrders(){
    const c=this.client(); if(!c) return {data:[], error:'not_configured'};
    const session=await this.getSession(); if(!session) return {data:[], error:'not_signed_in'};
    const { data, error } = await c.from('orders').select('*').eq('user_id', session.user.id).order('created_at',{ascending:false});
    return { data:data||[], error: error ? error.message : null };
  },
  /* Crea un pedido ligado al cliente logueado (se llama después del checkout por WhatsApp). */
  async createOrder(order){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const session=await this.getSession(); if(!session) return {error:'not_signed_in'};
    const { data, error } = await c.from('orders').insert(Object.assign({}, order, {user_id:session.user.id})).select().single();
    return { data, error: error ? error.message : null };
  },

  /* Solo para admin.html — protegido igual por RLS del lado del servidor. */
  async allOrders(){
    const c=this.client(); if(!c) return {data:[], error:'not_configured'};
    const { data, error } = await c.from('orders').select('*').order('created_at',{ascending:false});
    return { data:data||[], error: error ? error.message : null };
  },
  async updateOrderStatus(id, status){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { error } = await c.from('orders').update({status}).eq('id', id);
    return { error: error ? error.message : null };
  },
  async deleteOrder(id){
    const c=this.client(); if(!c) return {error:'not_configured'};
    const { error } = await c.from('orders').delete().eq('id', id);
    return { error: error ? error.message : null };
  }
};

/* ---------------------------------------------------------------------------
   API del store
--------------------------------------------------------------------------- */
const Lloope = {
  KEYS: LLOOPE_KEYS,
  DEFAULTS: LLOOPE_DEFAULTS,
  ORDER_STATES: LLOOPE_ORDER_STATES,
  SUPABASE_SETUP_SQL: LLOOPE_SUPABASE_SQL,
  MP_MIGRATION_SQL: LLOOPE_MP_MIGRATION_SQL,
  auth: LloopeAuth,

  /* Clase CSS del badge de estado de un pedido (usado por admin.html y por
     "Mis pedidos" en index.html/cart.html — mismo mapeo en un solo lugar). */
  orderStatusBadgeClass(status){
    const map={'Nuevo':'b-info','En revisión':'b-info','Pendiente de pago':'b-warn','Pagado':'b-on','En fabricación':'b-warn','Listo para entrega':'b-on','Entregado':'b-on','Cancelado':'b-danger'};
    return map[status]||'b-off';
  },

  clone(v){ return JSON.parse(JSON.stringify(v)); },

  get(key){
    try {
      const raw = localStorage.getItem(LLOOPE_KEYS[key]);
      if (raw === null) return this.clone(LLOOPE_DEFAULTS[key]);
      return JSON.parse(raw);
    } catch(e){
      console.warn("Lloope.get error:", key, e);
      return this.clone(LLOOPE_DEFAULTS[key]);
    }
  },

  set(key, value){
    try {
      localStorage.setItem(LLOOPE_KEYS[key], JSON.stringify(value));
      return true;
    } catch(e){
      // Suele ocurrir por exceso de cuota (imágenes base64 muy pesadas).
      alert("No se pudo guardar: el almacenamiento del navegador está lleno.\n"+
            "En una versión real las imágenes se guardan en un servidor (Cloudinary / S3), no en el navegador.");
      console.error("Lloope.set error:", key, e);
      return false;
    }
  },

  /* Carga los datos de ejemplo solo si la llave no existe todavía. */
  seedIfEmpty(){
    Object.keys(LLOOPE_DEFAULTS).forEach(k=>{
      if (localStorage.getItem(LLOOPE_KEYS[k]) === null){
        this.set(k, LLOOPE_DEFAULTS[k]);
      }
    });
  },

  /* Restaura TODO a los datos de prueba (no borra el carrito/perfil del cliente:
     eso pertenece a la sesión del visitante, no a los datos administrables).
     Tampoco borra "supabase": es una credencial de infraestructura que el
     admin configuró una vez, no contenido de demostración — perderla sin
     avisar sería un mal sorpresivo. */
  resetAll(){
    Object.keys(LLOOPE_KEYS).forEach(k=>{ if(k!=='supabase') localStorage.removeItem(LLOOPE_KEYS[k]); });
    localStorage.removeItem('lloope_used_coupons');
    this.seedIfEmpty();
  },

  nextId(list){
    return list.reduce((m,x)=> Math.max(m, Number(x.id)||0), 0) + 1;
  },

  money(n){
    return "$" + Number(n||0).toLocaleString("es-CL");
  },

  today(){
    return new Date().toISOString().slice(0,10);
  },

  /* Precio efectivo de un producto (oferta si tiene, precio normal si no). */
  effPrice(p){
    return (p.offerPrice && p.offerPrice>0) ? p.offerPrice : p.price;
  },

  /* ¿Un banner/cupón con {active,startDate,endDate} está vigente hoy?
     Usado por index.html, admin.html y cart.html para no repetir la
     misma comparación de fechas en tres lugares. */
  isActiveNow(item){
    if(!item || !item.active) return false;
    const today=this.today();
    if(item.startDate && today<item.startDate) return false;
    if(item.endDate && today>item.endDate) return false;
    return true;
  },

  /* ---------------------------------------------------------------------
     PUBLICAR: arma el JSON con el contenido público de la tienda (excluye
     pedidos, usuarios y la llave privada de pagos) y lo descarga como
     data/store.json para subirlo al hosting. Esto es lo que hace que los
     cambios del panel se vean igual para TODOS los visitantes, no solo en
     el navegador del administrador.
  --------------------------------------------------------------------- */
  buildPublicBundle(){
    const bundle = {};
    LLOOPE_PUBLIC_KEYS.forEach(k=>{ bundle[k] = this.get(k); });
    // La llave secreta de pagos jamás debe viajar en un archivo público.
    if (bundle.payment && bundle.payment.online) {
      bundle.payment = this.clone(bundle.payment);
      bundle.payment.online.secretKey = "";
    }
    bundle._publishedAt = new Date().toISOString();
    return bundle;
  },

  downloadJSON(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  },

  publish(){
    this.downloadJSON("store.json", this.buildPublicBundle());
  },

  /* ---------------------------------------------------------------------
     CARGA PÚBLICA (para index.html): intenta usar el archivo publicado
     data/store.json (fuente real para todos los visitantes); si no existe
     o falla (ej. abriendo el archivo local con doble clic), cae a
     localStorage (borrador del mismo navegador) y finalmente a los datos
     de ejemplo. Devuelve siempre un objeto con todas las llaves públicas.
  --------------------------------------------------------------------- */
  async loadPublicData(){
    let published = null;
    try {
      const res = await fetch('data/store.json', {cache:'no-store'});
      if (res.ok) published = await res.json();
    } catch(e){ /* sin conexión, file://, o aún no publicado: seguimos abajo */ }

    const data = {};
    LLOOPE_PUBLIC_KEYS.forEach(k=>{
      data[k] = (published && published[k] !== undefined) ? published[k] : this.get(k);
    });

    /* Si el hosting expone /api/config (función serverless de Vercel), esos
       valores mandan sobre store.json/localStorage — permite fijar Supabase
       y la URL de lloope-api por variable de entorno en vez de tipearlos en
       el admin. Ver fetchEnvConfig(). */
    const envCfg = await this.fetchEnvConfig();
    if (envCfg) data.supabase = { ...data.supabase, url: envCfg.url, anonKey: envCfg.anonKey, apiUrl: envCfg.apiUrl || data.supabase.apiUrl };

    data._source = published ? 'store.json' : 'localStorage/defaults';
    return data;
  },

  /* Lee la config de Supabase/lloope-api publicada como variable de entorno
     en el hosting (hoy: /api/config, función serverless de Vercel — ver
     /api/config.js). Devuelve null si el endpoint no existe (Cloudflare
     Pages, file://, dev local sin Vercel) o si las variables no están
     seteadas todavía, para que el resto del sitio siga funcionando igual. */
  async fetchEnvConfig(){
    try {
      const res = await fetch('/api/config', {cache:'no-store'});
      if (!res.ok) return null;
      const env = await res.json();
      return (env && env.supabase && env.supabase.url && env.supabase.anonKey) ? env.supabase : null;
    } catch(e){ return null; }
  },

  /* ---- Cupones de un solo uso: marca de "ya usado" por navegador (best-effort) ---- */
  isCouponUsedLocally(code){
    try { return JSON.parse(localStorage.getItem('lloope_used_coupons')||'[]').includes(String(code).toUpperCase()); }
    catch(e){ return false; }
  },
  markCouponUsedLocally(code){
    try {
      const used = JSON.parse(localStorage.getItem('lloope_used_coupons')||'[]');
      const up = String(code).toUpperCase();
      if(!used.includes(up)){ used.push(up); localStorage.setItem('lloope_used_coupons', JSON.stringify(used)); }
    } catch(e){}
  },

  /* ---------------------------------------------------------------------
     CARRITO PERSISTENTE: para que el contenido del carrito sobreviva la
     navegación entre index.html y cart.html (y un simple F5), se guarda en
     localStorage en vez de vivir solo en una variable de JavaScript.
  --------------------------------------------------------------------- */
  getCart(){
    try { return JSON.parse(localStorage.getItem(LLOOPE_CLIENT_KEYS.cartSession) || '[]'); }
    catch(e){ return []; }
  },
  setCart(cart){
    try { localStorage.setItem(LLOOPE_CLIENT_KEYS.cartSession, JSON.stringify(cart)); } catch(e){}
  },
  clearCart(){
    localStorage.removeItem(LLOOPE_CLIENT_KEYS.cartSession);
  },

  /* ---------------------------------------------------------------------
     PERFIL DE INVITADO: datos de contacto (y facturación) que el cliente
     elige recordar en SU navegador para agilizar su próxima compra.
     ⚠️ No es una cuenta protegida por contraseña ni una autenticación real
     — cualquiera que use el mismo navegador/dispositivo puede verlos y
     editarlos. Para cuentas de cliente reales con login seguro se necesita
     backend (ver PRODUCCION.md).
  --------------------------------------------------------------------- */
  getProfile(){
    try { return JSON.parse(localStorage.getItem(LLOOPE_CLIENT_KEYS.profile) || 'null'); }
    catch(e){ return null; }
  },
  setProfile(profile){
    try { localStorage.setItem(LLOOPE_CLIENT_KEYS.profile, JSON.stringify(profile)); return true; }
    catch(e){ return false; }
  },
  clearProfile(){
    localStorage.removeItem(LLOOPE_CLIENT_KEYS.profile);
  },

  /* ---------------------------------------------------------------------
     LEADS (pop-up de salida): guarda el correo capturado SOLO en este
     navegador. ⚠️ Esto NO te lo envía a ti — sin conectar un servicio real
     de correo/formularios (EmailJS, Formspree, Brevo, etc.) el dueño de la
     tienda nunca ve estos leads salvo que revise el mismo navegador donde
     se capturaron. Ver submitLead() en index.html para el punto exacto
     donde conectar ese servicio, y PRODUCCION.md para más detalle.
  --------------------------------------------------------------------- */
  addLead(email){
    try {
      const leads = JSON.parse(localStorage.getItem(LLOOPE_CLIENT_KEYS.leads) || '[]');
      leads.push({ email, date: new Date().toISOString() });
      localStorage.setItem(LLOOPE_CLIENT_KEYS.leads, JSON.stringify(leads));
    } catch(e){}
  },
  getLeads(){
    try { return JSON.parse(localStorage.getItem(LLOOPE_CLIENT_KEYS.leads) || '[]'); }
    catch(e){ return []; }
  }
};

/* Auto-semilla al cargar el archivo (idempotente). */
try { Lloope.seedIfEmpty(); } catch(e){ console.warn(e); }

/* Exponer global */
window.Lloope = Lloope;
