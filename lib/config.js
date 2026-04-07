const requiredEnvVars = [
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  webhookSecretToken: process.env.WEBHOOK_SECRET_TOKEN || "",
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL || ""
};

function validateConfig() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  config,
  validateConfig
};
