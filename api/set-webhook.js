const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || undefined;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!BOT_TOKEN || !WEBHOOK_URL) {
    return res.status(500).json({
      ok: false,
      error: "TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_URL must be configured"
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        secret_token: WEBHOOK_SECRET_TOKEN,
        allowed_updates: ["message", "callback_query"]
      })
    });

    const data = await response.json();
    return res.status(response.ok ? 200 : 400).json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
