import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Tables = {
  competitor_estimates: { id: string; project_id?: string; source_file: string; items: any; analysis: any; created_at: string }
  telegram_chats: { id: string; chat_id: string; project_id?: string; enabled: boolean; notifications_config: any }
  handwriting_results: { id: string; photo_url: string; recognized_text: string; confidence: number; created_at: string }
  local_prices: { id: string; category: string; name: string; unit: string; price: number; region: string; city: string; updated_at: string }
}
