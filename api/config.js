// Función serverless de Vercel (zero-config: cualquier archivo bajo /api se
// despliega automáticamente como endpoint, sin build step ni package.json).
// Expone la config de Supabase y la URL de lloope-api desde variables de
// entorno del proyecto en Vercel (Settings → Environment Variables), para
// no tener que pegarlas a mano en el panel admin. Ninguno de estos valores
// es secreto: la anon key está diseñada para ser pública (la protección real
// la da Row Level Security) y hoy ya viaja igual dentro de data/store.json.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabase: {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      apiUrl: process.env.LLOOPE_API_URL || ''
    }
  });
};
