const { createClient } = require("@supabase/supabase-js");
const { config } = require("./config");

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function upsertTelegramUser(telegramUser, role = "client") {
  const payload = {
    telegram_user_id: telegramUser.id,
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || null,
    last_name: telegramUser.last_name || null,
    role
  };

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "telegram_user_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getOrCreateSession(telegramUserId) {
  const { data, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  const { data: created, error: createError } = await supabase
    .from("bot_sessions")
    .insert({
      telegram_user_id: telegramUserId,
      state: "idle",
      payload: {}
    })
    .select()
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}

async function updateSession(telegramUserId, state, payload) {
  const { data, error } = await supabase
    .from("bot_sessions")
    .upsert(
      {
        telegram_user_id: telegramUserId,
        state,
        payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: "telegram_user_id" }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function clearSession(telegramUserId) {
  return updateSession(telegramUserId, "idle", {});
}

async function listProvidersByCategory(category) {
  const query = supabase
    .from("providers")
    .select("*")
    .eq("is_active", true)
    .order("is_verified", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  const { data, error } = category
    ? await query.eq("category", category)
    : await query;

  if (error) {
    throw error;
  }

  return data;
}

async function getProviderById(providerId) {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertProvider(providerInput) {
  const { data, error } = await supabase
    .from("providers")
    .upsert(providerInput, { onConflict: "telegram_user_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function createServiceRequest(requestInput) {
  const { data, error } = await supabase
    .from("service_requests")
    .insert(requestInput)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function listServiceRequestsForClient(telegramUserId) {
  const { data, error } = await supabase
    .from("service_requests")
    .select("*")
    .eq("client_telegram_user_id", telegramUserId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  clearSession,
  createServiceRequest,
  getOrCreateSession,
  getProviderById,
  listProvidersByCategory,
  listServiceRequestsForClient,
  supabase,
  updateSession,
  upsertProvider,
  upsertTelegramUser
};
