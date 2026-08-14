-- Correct migration to add Paddle columns to subscriptions table and ensure they exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'paddle_customer_id') THEN
    ALTER TABLE public.subscriptions ADD COLUMN paddle_customer_id TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'paddle_subscription_id') THEN
    ALTER TABLE public.subscriptions ADD COLUMN paddle_subscription_id TEXT UNIQUE;
  END IF;
END $$;
