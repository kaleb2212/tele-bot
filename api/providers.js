const supabase = require("./supabaseClient");

function parseServiceSlugs(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  const { method } = req;

  try {
    if (method === "POST") {
      const { name, phone, location, bio, service_slugs } = req.body || {};
      const normalizedSlugs = parseServiceSlugs(service_slugs);

      if (!name || !phone || !normalizedSlugs.length) {
        return res.status(400).json({ error: "name, phone, and service_slugs are required" });
      }

      const { data: services, error: serviceError } = await supabase
        .from("service_types")
        .select("id, name, slug")
        .in("slug", normalizedSlugs);

      if (serviceError) {
        return res.status(500).json({ error: serviceError.message });
      }

      if (!services || services.length !== normalizedSlugs.length) {
        return res.status(400).json({ error: "One or more service_slugs are invalid" });
      }

      const { data: provider, error: providerError } = await supabase
        .from("service_providers")
        .insert([{ name, phone, location, bio }])
        .select("*")
        .single();

      if (providerError) {
        return res.status(500).json({ error: providerError.message });
      }

      const links = services.map((service) => ({
        provider_id: provider.id,
        service_type_id: service.id
      }));

      const { error: linkError } = await supabase.from("provider_services").insert(links);
      if (linkError) {
        return res.status(500).json({ error: linkError.message });
      }

      return res.status(201).json({ provider, services });
    }

    if (method === "GET") {
      const service = String(req.query?.service || "").trim().toLowerCase();
      const location = String(req.query?.location || "").trim();

      let query = supabase.from("provider_services").select(
        `
          provider_id,
          service_type_id,
          service_type:service_types!inner(id, name, slug),
          provider:service_providers!inner(id, name, phone, location, bio, is_verified)
        `
      );

      if (service) {
        const { data: serviceType, error: serviceTypeError } = await supabase
          .from("service_types")
          .select("id")
          .eq("slug", service)
          .maybeSingle();

        if (serviceTypeError) {
          return res.status(500).json({ error: serviceTypeError.message });
        }

        if (!serviceType) {
          return res.status(400).json({ error: "Invalid service slug" });
        }

        query = query.eq("service_type_id", serviceType.id);
      }

      if (location) {
        query = query.ilike("provider.location", `%${location}%`);
      }

      const { data, error } = await query;
      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const providers = (data || []).map((row) => ({
        ...row.provider,
        service_type: row.service_type
      }));

      return res.status(200).json(providers);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
