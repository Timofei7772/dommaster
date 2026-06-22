Supabase Migration Guide
=========================

Your Supabase project is already connected:
  URL:    https://ryiejjywpklfloebtaev.supabase.co
  Reference ID:  ryiejjywpklfloebtaev

To create the tables:

1. Open https://supabase.com/dashboard/project/ryiejjywpklfloebtaev/sql/new
2. Copy the content of `supabase_migration.sql` into the editor
3. Click "Run" (Execute all SQL)

This will create:
- local_prices (with Bashkortostan seed data)
- competitor_estimates
- telegram_chats
- handwriting_results
- projects

After tables exist, sync your local data:
  cd backend && python sync_supabase.py
