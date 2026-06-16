export default async function handler(_req: any, res: any) {
  return res.status(200).json({
    VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  })
}
