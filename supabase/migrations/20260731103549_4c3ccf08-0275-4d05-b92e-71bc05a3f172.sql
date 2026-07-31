DROP TRIGGER IF EXISTS on_auth_user_bootstrap_admin ON auth.users;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobid IN (1, 2);