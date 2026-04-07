const supabase = require("./supabaseClient");
const sendMessage = require("../utils/sendMessage");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const chatState = new Map();

function normalize(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function getState(chatId) {
  return chatState.get(String(chatId)) || null;
}

function setState(chatId, state) {
  chatState.set(String(chatId), state);
}

function clearState(chatId) {
  chatState.delete(String(chatId));
}

async function upsertClient(from, phone) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || from.username || null;
  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        telegram_id: from.id,
        name,
        phone: phone || undefined
      },
      { onConflict: "telegram_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getServiceTypes() {
  const { data, error } = await supabase.from("service_types").select("id, name, slug").order("name");
  if (error) {
    throw error;
  }
  return data || [];
}

async function findServiceTypeBySlug(slug) {
  const { data, error } = await supabase
    .from("service_types")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function searchProviders(serviceSlug, location) {
  const serviceType = await findServiceTypeBySlug(serviceSlug);
  if (!serviceType) {
    return { serviceType: null, providers: [] };
  }

  let query = supabase
    .from("provider_services")
    .select(
      `
        provider_id,
        service_type_id,
        provider:service_providers!inner(id, name, phone, location, bio, is_verified)
      `
    )
    .eq("service_type_id", serviceType.id);

  if (location) {
    query = query.ilike("provider.location", `%${location}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return {
    serviceType,
    providers: (data || []).map((row) => ({
      ...row.provider,
      service_type_id: row.service_type_id
    }))
  };
}

async function createRequestRecord(payload) {
  const { data, error } = await supabase
    .from("service_requests")
    .insert([payload])
    .select(
      `
        id,
        status,
        provider:service_providers(name, phone),
        service_type:service_types(name, slug)
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getClientRequestStatus(requestId, telegramId) {
  const { data, error } = await supabase
    .from("service_requests")
    .select(
      `
        id,
        status,
        client_location,
        updated_at,
        client:clients!inner(telegram_id),
        provider:service_providers(name, phone, location),
        service_type:service_types(name, slug)
      `
    )
    .eq("id", requestId)
    .eq("client.telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function listProvidersForAdmin() {
  const { data, error } = await supabase
    .from("service_providers")
    .select(
      `
        id,
        name,
        phone,
        location,
        is_verified,
        provider_services(service_type:service_types(slug))
      `
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return data || [];
}

async function listRequestsForAdmin() {
  const { data, error } = await supabase
    .from("service_requests")
    .select(
      `
        id,
        status,
        client:clients(name, telegram_id),
        provider:service_providers(name),
        service_type:service_types(slug)
      `
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return data || [];
}

async function answerCallbackQuery(callbackQueryId, text) {
  if (!BOT_TOKEN) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text
    })
  });
}

function requestKeyboard(providers) {
  return {
    inline_keyboard: providers.map((provider) => [
      {
        text: `Request ${provider.name}`,
        callback_data: `request:${provider.id}:${provider.service_type_id}`
      }
    ])
  };
}

async function sendServices(chatId) {
  const services = await getServiceTypes();
  const lines = services.map((service) => `- ${escapeMarkdown(service.slug)} \\(${escapeMarkdown(service.name)}\\)`);
  return sendMessage(chatId, ["*Supported services*", "", ...lines].join("\n"));
}

async function handleProviderRegistration(chatId, text) {
  const state = getState(chatId);
  if (!state || state.flow !== "provider") {
    return false;
  }

  if (state.step === "name") {
    setState(chatId, { ...state, step: "phone", data: { ...state.data, name: text } });
    await sendMessage(chatId, "Send the provider phone number.");
    return true;
  }

  if (state.step === "phone") {
    setState(chatId, { ...state, step: "location", data: { ...state.data, phone: text } });
    await sendMessage(chatId, "Send the provider location. Example: Bole, Addis Ababa");
    return true;
  }

  if (state.step === "location") {
    setState(chatId, { ...state, step: "bio", data: { ...state.data, location: text } });
    await sendMessage(chatId, "Send a short provider bio.");
    return true;
  }

  if (state.step === "bio") {
    setState(chatId, { ...state, step: "services", data: { ...state.data, bio: text } });
    await sendMessage(chatId, "Send service slugs separated by commas. Example: painter, roofer");
    return true;
  }

  if (state.step === "services") {
    const serviceSlugs = text
      .split(",")
      .map((item) => slugify(item))
      .filter(Boolean);

    if (!serviceSlugs.length) {
      await sendMessage(chatId, "Send at least one service slug. Example: painter, roofer");
      return true;
    }

    const { data: services, error: serviceError } = await supabase
      .from("service_types")
      .select("id, name, slug")
      .in("slug", serviceSlugs);

    if (serviceError) {
      throw serviceError;
    }

    if (!services || services.length !== serviceSlugs.length) {
      await sendMessage(chatId, "One or more service slugs are invalid. Use /services to see the supported list.");
      return true;
    }

    const { data: provider, error: providerError } = await supabase
      .from("service_providers")
      .insert([
        {
          name: state.data.name,
          phone: state.data.phone,
          location: state.data.location,
          bio: state.data.bio
        }
      ])
      .select("*")
      .single();

    if (providerError) {
      throw providerError;
    }

    const links = services.map((service) => ({
      provider_id: provider.id,
      service_type_id: service.id
    }));
    const { error: linkError } = await supabase.from("provider_services").insert(links);
    if (linkError) {
      throw linkError;
    }

    clearState(chatId);
    await sendMessage(
      chatId,
      [
        "*Provider registered*",
        `Name: ${escapeMarkdown(provider.name)}`,
        `Phone: ${escapeMarkdown(provider.phone)}`,
        `Location: ${escapeMarkdown(provider.location || "Not specified")}`,
        `Services: ${escapeMarkdown(services.map((item) => item.name).join(", "))}`,
        "Verification: Pending manual review"
      ].join("\n")
    );
    return true;
  }

  return false;
}

async function handleRequestCreation(chatId, from, text) {
  const state = getState(chatId);
  if (!state || state.flow !== "request") {
    return false;
  }

  if (state.step === "description") {
    setState(chatId, { ...state, step: "location", data: { ...state.data, description: text } });
    await sendMessage(chatId, "Send the client location for this request.");
    return true;
  }

  if (state.step === "location") {
    setState(chatId, { ...state, step: "phone", data: { ...state.data, client_location: text } });
    await sendMessage(chatId, "Send your phone number.");
    return true;
  }

  if (state.step === "phone") {
    const client = await upsertClient(from, text);
    const request = await createRequestRecord({
      client_id: client.id,
      provider_id: state.data.provider_id,
      service_type_id: state.data.service_type_id,
      description: state.data.description,
      client_location: state.data.client_location,
      status: "REQUESTED"
    });

    clearState(chatId);
    await sendMessage(
      chatId,
      [
        "*Request created*",
        `ID: ${escapeMarkdown(String(request.id))}`,
        `Status: ${escapeMarkdown(request.status)}`,
        `Provider: ${escapeMarkdown(request.provider?.name || "Unknown")}`,
        `Service: ${escapeMarkdown(request.service_type?.name || "Unknown")}`,
        `Use /status ${escapeMarkdown(String(request.id))} to check progress.`
      ].join("\n")
    );
    return true;
  }

  return false;
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = normalize(message.text);
  const from = message.from;

  await upsertClient(from);

  if (await handleProviderRegistration(chatId, text)) {
    return;
  }

  if (await handleRequestCreation(chatId, from, text)) {
    return;
  }

  if (text === "/start" || text === "/help") {
    clearState(chatId);
    return sendMessage(
      chatId,
      [
        "*Service Marketplace Bot*",
        "",
        "/services",
        "/register_provider",
        "/search <service-slug>",
        "/search <service-slug> | <location>",
        "/status <request-id>",
        "/list_providers <password>",
        "/list_requests <password>"
      ].join("\n")
    );
  }

  if (text === "/services") {
    return sendServices(chatId);
  }

  if (text === "/register_provider") {
    setState(chatId, { flow: "provider", step: "name", data: {} });
    return sendMessage(chatId, "Send the provider name or business name.");
  }

  if (text.startsWith("/search")) {
    const args = text.replace("/search", "").trim();
    if (!args) {
      return sendMessage(chatId, "Usage: /search <service-slug> or /search <service-slug> | <location>");
    }

    const [serviceInput, locationInput] = args.split("|").map((item) => normalize(item));
    const serviceSlug = slugify(serviceInput);
    const { serviceType, providers } = await searchProviders(serviceSlug, locationInput);

    if (!serviceType) {
      return sendMessage(chatId, "Unknown service slug. Use /services to see the supported list.");
    }

    if (!providers.length) {
      return sendMessage(chatId, "No matching providers found.");
    }

    const lines = [
      `Results for *${escapeMarkdown(serviceType.name)}*${locationInput ? ` in *${escapeMarkdown(locationInput)}*` : ""}:`,
      ""
    ];

    providers.forEach((provider, index) => {
      lines.push(
        `${index + 1}. *${escapeMarkdown(provider.name)}*${provider.is_verified ? " \\(Verified\\)" : ""}`,
        `Phone: ${escapeMarkdown(provider.phone)}`,
        `Location: ${escapeMarkdown(provider.location || "Not specified")}`,
        `Bio: ${escapeMarkdown(provider.bio || "No bio provided")}`,
        ""
      );
    });

    return sendMessage(chatId, lines.join("\n"), { reply_markup: requestKeyboard(providers) });
  }

  if (text.startsWith("/status")) {
    const requestId = text.replace("/status", "").trim();
    if (!requestId) {
      return sendMessage(chatId, "Usage: /status <request-id>");
    }

    const request = await getClientRequestStatus(requestId, from.id);
    if (!request) {
      return sendMessage(chatId, "Request not found for your Telegram account.");
    }

    return sendMessage(
      chatId,
      [
        `*Request ${escapeMarkdown(String(request.id))}*`,
        `Status: ${escapeMarkdown(request.status)}`,
        `Service: ${escapeMarkdown(request.service_type?.name || "Unknown")}`,
        `Provider: ${escapeMarkdown(request.provider?.name || "Not assigned")}`,
        `Provider phone: ${escapeMarkdown(request.provider?.phone || "Not available")}`,
        `Location: ${escapeMarkdown(request.client_location || "Not specified")}`,
        `Updated: ${escapeMarkdown(new Date(request.updated_at).toISOString())}`
      ].join("\n")
    );
  }

  if (text.startsWith("/list_providers")) {
    const password = text.replace("/list_providers", "").trim();
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return sendMessage(chatId, "Forbidden. Usage: /list_providers <password>");
    }

    const providers = await listProvidersForAdmin();
    if (!providers.length) {
      return sendMessage(chatId, "No providers found.");
    }

    const lines = providers.map((provider) => {
      const services = (provider.provider_services || [])
        .map((entry) => entry.service_type?.slug)
        .filter(Boolean)
        .join(", ");
      return [
        `*${escapeMarkdown(provider.name)}*`,
        `Phone: ${escapeMarkdown(provider.phone)}`,
        `Location: ${escapeMarkdown(provider.location || "Not specified")}`,
        `Verified: ${provider.is_verified ? "yes" : "no"}`,
        `Services: ${escapeMarkdown(services || "none")}`
      ].join("\n");
    });

    return sendMessage(chatId, lines.join("\n\n"));
  }

  if (text.startsWith("/list_requests")) {
    const password = text.replace("/list_requests", "").trim();
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return sendMessage(chatId, "Forbidden. Usage: /list_requests <password>");
    }

    const requests = await listRequestsForAdmin();
    if (!requests.length) {
      return sendMessage(chatId, "No requests found.");
    }

    const lines = requests.map((request) =>
      [
        `*${escapeMarkdown(String(request.id))}*`,
        `Status: ${escapeMarkdown(request.status)}`,
        `Client: ${escapeMarkdown(request.client?.name || "Unknown")} \\(${escapeMarkdown(String(request.client?.telegram_id || ""))}\\)`,
        `Provider: ${escapeMarkdown(request.provider?.name || "Unknown")}`,
        `Service: ${escapeMarkdown(request.service_type?.slug || "Unknown")}`
      ].join("\n")
    );

    return sendMessage(chatId, lines.join("\n\n"));
  }

  return sendMessage(chatId, "Unknown command. Use /start or /services.");
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = normalize(callbackQuery.data);

  if (!chatId || !data.startsWith("request:")) {
    return;
  }

  const [, providerId, serviceTypeId] = data.split(":");
  await answerCallbackQuery(callbackQuery.id, "Request flow started");
  setState(chatId, {
    flow: "request",
    step: "description",
    data: {
      provider_id: Number(providerId),
      service_type_id: Number(serviceTypeId)
    }
  });

  await sendMessage(chatId, "Send a short description of the work you need done.");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    if (WEBHOOK_SECRET_TOKEN) {
      const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
      if (incomingSecret !== WEBHOOK_SECRET_TOKEN) {
        return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
      }
    }

    const update = req.body || {};
    if (update.message) {
      await handleMessage(update.message);
    }
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("telegram-webhook error", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
