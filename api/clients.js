const supabase = require("./supabaseClient");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { telegram_id, name, phone } = req.body || {};
      if (!telegram_id) {
        return res.status(400).json({ error: "telegram_id required" });
      }

      const { data, error } = await supabase
        .from("clients")
        .upsert({ telegram_id, name, phone }, { onConflict: "telegram_id" })
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(data);
    }

    if (req.method === "GET") {
      const telegramId = req.query?.telegram_id;
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id required" });
      }

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("telegram_id", telegramId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Client not found" });
      }

      return res.status(200).json(data);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
