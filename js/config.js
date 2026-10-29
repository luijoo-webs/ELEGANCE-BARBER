/* Conexión a Supabase.
   Solo va aquí la clave PÚBLICA (anon / publishable). NUNCA la service_role:
   los permisos los hace cumplir RLS en la base de datos.
   Supabase → Project Settings → API → Project URL / Publishable (anon) key. */
export const SUPABASE_URL = "https://bmbcyngdancirqvvyfdn.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtYmN5bmdkYW5jaXJxdnZ5ZmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyOTQ3MDIsImV4cCI6MjEwODg3MDcwMn0.AhYa7aXI71NH-4kPlgTwZ5kEFkJ2pfKKFPsE6FEb9-Q";
