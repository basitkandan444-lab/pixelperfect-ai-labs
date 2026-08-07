-- Migration to add Paddle columns to subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT UNIQUE;
