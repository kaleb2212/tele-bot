const {
  clearSession,
  createServiceRequest,
  getOrCreateSession,
  getProviderById,
  listProvidersByCategory,
  listServiceRequestsForClient,
  updateSession,
  upsertProvider,
  upsertTelegramUser
} = require("./supabase");
const {
  SERVICE_CATEGORIES,
  answerCallbackQuery,
  buildCategoryKeyboard,
  buildMainMenuKeyboard,
  buildProviderDetailsKeyboard,
  buildProviderListKeyboard,
  sendMessage
} = require("./telegram");

async function handleTelegramUpdate(update) {
  if (update.message) {
    return handleMessage(update.message);
  }

  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const telegramUser = message.from;

  await upsertTelegramUser(telegramUser);
  const session = await getOrCreateSession(telegramUser.id);

  if (text === "/start" || text === "/menu") {
    await clearSession(telegramUser.id);
    return sendWelcome(chatId);
  }

  if (text === "/help") {
    return sendHelp(chatId);
  }

  if (session.state === "awaiting_request_description") {
    await updateSession(telegramUser.id, "awaiting_request_location", {
      ...session.payload,
      description: text
    });
    return sendMessage(
      chatId,
      "Share the job location in Addis Ababa. Example: *Bole, near Edna Mall*"
    );
  }

  if (session.state === "awaiting_request_location") {
    await updateSession(telegramUser.id, "awaiting_request_phone", {
      ...session.payload,
      location: text
    });
    return sendMessage(
      chatId,
      "Send the best phone number for the provider to reach you."
    );
  }

  if (session.state === "awaiting_request_phone") {
    const request = await createServiceRequest({
      client_telegram_user_id: telegramUser.id,
      provider_id: session.payload.providerId || null,
      category: session.payload.category,
      description: session.payload.description,
      location: session.payload.location,
      client_phone: text,
      status: "pending"
    });

    await clearSession(telegramUser.id);

    return sendMessage(
      chatId,
      `Your request has been submitted.\n\nReference: *${request.id}*\nCategory: *${request.category}*\nStatus: *pending*`,
      buildMainMenuKeyboard()
    );
  }

  if (session.state === "awaiting_provider_name") {
    await updateSession(telegramUser.id, "awaiting_provider_phone", {
      fullName: text
    });
    return sendMessage(chatId, "Send your public business phone number.");
  }

  if (session.state === "awaiting_provider_phone") {
    await updateSession(telegramUser.id, "awaiting_provider_category", {
      ...session.payload,
      phone: text
    });
    return sendMessage(
      chatId,
      `Choose your service category by sending one of these exactly:\n\n${SERVICE_CATEGORIES.join("\n")}`
    );
  }

  if (session.state === "awaiting_provider_category") {
    if (!SERVICE_CATEGORIES.includes(text)) {
      return sendMessage(
        chatId,
        "That category is not in the supported MVP list. Send one of the listed categories exactly."
      );
    }

    await updateSession(telegramUser.id, "awaiting_provider_bio", {
      ...session.payload,
      category: text
    });
    return sendMessage(
      chatId,
      "Write a short profile description. Mention what you do, your area, and why clients should trust you."
    );
  }

  if (session.state === "awaiting_provider_bio") {
    await updateSession(telegramUser.id, "awaiting_provider_experience", {
      ...session.payload,
      bio: text
    });
    return sendMessage(chatId, "How many years of experience do you have? Send only a number.");
  }

  if (session.state === "awaiting_provider_experience") {
    const years = Number(text);
    if (Number.isNaN(years) || years < 0) {
      return sendMessage(chatId, "Send a valid number of years. Example: 5");
    }

    await updateSession(telegramUser.id, "awaiting_provider_price", {
      ...session.payload,
      yearsExperience: years
    });
    return sendMessage(chatId, "What is your starting price in ETB? Send only a number.");
  }

  if (session.state === "awaiting_provider_price") {
    const startingPrice = Number(text);
    if (Number.isNaN(startingPrice) || startingPrice < 0) {
      return sendMessage(chatId, "Send a valid ETB amount. Example: 1500");
    }

    const provider = await upsertProvider({
      telegram_user_id: telegramUser.id,
      full_name: session.payload.fullName,
      phone: session.payload.phone,
      category: session.payload.category,
      bio: session.payload.bio,
      years_experience: session.payload.yearsExperience,
      starting_price_etb: startingPrice,
      service_area: "Addis Ababa",
      is_active: true
    });

    await upsertTelegramUser(telegramUser, "provider");
    await clearSession(telegramUser.id);

    return sendMessage(
      chatId,
      `Your provider profile is saved.\n\nName: *${provider.full_name}*\nCategory: *${provider.category}*\nStatus: *active*\n\nYou can now ask clients to find you through this bot.`,
      buildMainMenuKeyboard()
    );
  }

  return sendMessage(
    chatId,
    "Use /start to open the menu, browse providers, or register as a provider.",
    buildMainMenuKeyboard()
  );
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const telegramUser = callbackQuery.from;
  const data = callbackQuery.data;

  await upsertTelegramUser(telegramUser);

  if (data === "main_menu") {
    await answerCallbackQuery(callbackQuery.id, "Opening menu");
    return sendWelcome(chatId);
  }

  if (data === "browse_categories") {
    await answerCallbackQuery(callbackQuery.id, "Browse categories");
    return sendMessage(chatId, "Choose a category:", buildCategoryKeyboard());
  }

  if (data === "provider_signup") {
    await updateSession(telegramUser.id, "awaiting_provider_name", {});
    await answerCallbackQuery(callbackQuery.id, "Provider sign-up started");
    return sendMessage(chatId, "Send your full name or business name.");
  }

  if (data === "my_requests") {
    const requests = await listServiceRequestsForClient(telegramUser.id);
    await answerCallbackQuery(callbackQuery.id, "Loading your requests");

    if (!requests.length) {
      return sendMessage(chatId, "You have no requests yet.", buildMainMenuKeyboard());
    }

    const lines = requests.map(
      (request) =>
        `- ${request.category} | ${request.status} | ${new Date(request.created_at).toLocaleDateString("en-ET")}`
    );

    return sendMessage(chatId, `Your latest requests:\n\n${lines.join("\n")}`, buildMainMenuKeyboard());
  }

  if (data.startsWith("category:")) {
    const category = data.replace("category:", "");
    const providers = await listProvidersByCategory(category);
    await answerCallbackQuery(callbackQuery.id, `Showing ${category}`);

    if (!providers.length) {
      return sendMessage(
        chatId,
        `No active providers found for *${category}* yet.`,
        buildCategoryKeyboard()
      );
    }

    return sendMessage(
      chatId,
      `Available providers for *${category}*:`,
      buildProviderListKeyboard(providers)
    );
  }

  if (data.startsWith("provider:")) {
    const providerId = data.replace("provider:", "");
    const provider = await getProviderById(providerId);
    await answerCallbackQuery(callbackQuery.id, "Loading provider");

    if (!provider) {
      return sendMessage(chatId, "Provider not found.", buildCategoryKeyboard());
    }

    const details = [
      `*${provider.full_name}*`,
      provider.is_verified ? "Verified provider" : "Unverified provider",
      `Category: *${provider.category}*`,
      `Area: *${provider.service_area || "Addis Ababa"}*`,
      `Experience: *${provider.years_experience || 0} years*`,
      `Starting price: *${provider.starting_price_etb || "N/A"} ETB*`,
      "",
      provider.bio || "No profile description yet.",
      "",
      `Phone: *${provider.phone}*`
    ];

    return sendMessage(
      chatId,
      details.join("\n"),
      buildProviderDetailsKeyboard(provider.id, provider.category)
    );
  }

  if (data.startsWith("request_provider:")) {
    const [, providerId, category] = data.split(":");
    await updateSession(telegramUser.id, "awaiting_request_description", {
      providerId,
      category
    });
    await answerCallbackQuery(callbackQuery.id, "Request flow started");
    return sendMessage(
      chatId,
      "Describe the job you need done. Include urgency, size, and any useful details."
    );
  }

  await answerCallbackQuery(callbackQuery.id, "Unknown action");
  return sendMessage(chatId, "That action is no longer available. Use /start to reopen the menu.");
}

async function sendWelcome(chatId) {
  return sendMessage(
    chatId,
    "Welcome to the Addis Service Marketplace Bot.\n\nFind trusted local professionals in Addis Ababa or register your service business.",
    buildMainMenuKeyboard()
  );
}

async function sendHelp(chatId) {
  return sendMessage(
    chatId,
    "Commands:\n/start - Open the main menu\n/menu - Open the main menu\n/help - Show help\n\nFrom the menu you can browse providers, submit service requests, or register as a provider.",
    buildMainMenuKeyboard()
  );
}

module.exports = {
  handleTelegramUpdate
};
