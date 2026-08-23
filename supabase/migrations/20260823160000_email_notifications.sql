-- Email preferences, admin send logs, and platform storage alert history.

CREATE TABLE IF NOT EXISTS email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_id uuid REFERENCES practices(id) ON DELETE CASCADE,
  filing_reminders boolean NOT NULL DEFAULT true,
  marketing_emails boolean NOT NULL DEFAULT true,
  unsubscribe_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  filing_reminder_sent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, practice_id)
);

CREATE INDEX IF NOT EXISTS email_preferences_user_idx ON email_preferences (user_id);
CREATE INDEX IF NOT EXISTS email_preferences_token_idx ON email_preferences (unsubscribe_token);

CREATE TABLE IF NOT EXISTS admin_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by text NOT NULL,
  template_key text NOT NULL,
  subject text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  recipient_filter text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_storage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL DEFAULT 'r2_quota',
  threshold_pct integer NOT NULL,
  bytes_used bigint NOT NULL,
  bytes_limit bigint NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_storage_alerts_type_sent_idx
  ON platform_storage_alerts (alert_type, sent_at DESC);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_storage_alerts ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own preferences.
CREATE POLICY email_preferences_select_own ON email_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY email_preferences_update_own ON email_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY email_preferences_insert_own ON email_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS for cron/admin.
