const supabase = require("./supabaseClient");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ALLOWED_STATUSES = ["NEW", "MATCHED", "REQUESTED", "ACCEPTED", "COMPLETED", "CANCELLED"];

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { client_id, provider_id, service_type_id, description, client_location } = req.body || {};
      if (!client_id || !provider_id || !service_type_id) {
        return res.status(400).json({ error: "client_id, provider_id, and service_type_id are required" });
      }

      const { data, error } = await supabase
        .from("service_requests")
        .insert([
          {
            client_id,
            provider_id,
            service_type_id,
            description,
            client_location,
            status: "REQUESTED"
          }
        ])
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    }

    if (req.method === "PATCH") {
      const adminPass = req.headers["x-admin-pass"];
      if (!ADMIN_PASSWORD || adminPass !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const id = req.body?.id;
      const status = String(req.body?.status || "").toUpperCase();
      if (!id || !status) {
        return res.status(400).json({ error: "id and status are required" });
      }

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const { data, error } = await supabase
        .from("service_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(data);
    }

    if (req.method === "GET") {
      const adminPass = req.headers["x-admin-pass"];
      if (!ADMIN_PASSWORD || adminPass !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(
          `
            id,
            description,
            client_location,
            status,
            created_at,
            updated_at,
            client:clients(name, phone, telegram_id),
            provider:service_providers(name, phone, location),
            service_type:service_types(name, slug)
          `
        )
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(data || []);
    }

    res.setHeader("Allow", ["GET", "POST", "PATCH"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
