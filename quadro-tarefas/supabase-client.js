// Supabase Vanilla JS Client
const SUPABASE_URL = 'https://qrasolgjxiocpltdlaez.supabase.co';
// Chave anon (public) — formato JWT válido
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyYXNvbGdqeGlvY3BsdGRsYWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDIyMjUsImV4cCI6MjA5NDExODIyNX0.c-qoBR0agB0zORSVG84WiYNgsON-rr0HfXhutgmXSR4';

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
