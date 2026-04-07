const { config } = require("./config");

const SERVICE_CATEGORIES = [
  "Carpenter",
  "Painter",
  "Roofer",
  "General Handyman",
  "Appliance Repair Technician",
  "Security System Installer",
  "Gutter Installer / Cleaner",
  "Landscaper / Lawn Care Specialist",
  "Pest Control Technician",
  "Generator Technician"
];

async function telegramRequest(method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error on ${method}`);
  }

  return data;
}

function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Browse providers", callback_data: "browse_categories" }],
      [{ text: "Become a provider", callback_data: "provider_signup" }],
      [{ text: "My requests", callback_data: "my_requests" }]
    ]
  };
}

function buildCategoryKeyboard() {
  return {
    inline_keyboard: [
      ...SERVICE_CATEGORIES.map((category) => [
        {
          text: category,
          callback_data: `category:${category}`
        }
      ]),
      [{ text: "Back to menu", callback_data: "main_menu" }]
    ]
  };
}

function buildProviderListKeyboard(providers) {
  return {
    inline_keyboard: [
      ...providers.map((provider) => [
        {
          text: `${provider.full_name} (${provider.category})`,
          callback_data: `provider:${provider.id}`
        }
      ]),
      [{ text: "Back to categories", callback_data: "browse_categories" }]
    ]
  };
}

function buildProviderDetailsKeyboard(providerId, category) {
  return {
    inline_keyboard: [
      [
        {
          text: "Request this provider",
          callback_data: `request_provider:${providerId}:${category}`
        }
      ],
      [{ text: "Back to categories", callback_data: "browse_categories" }]
    ]
  };
}

async function sendMessage(chatId, text, replyMarkup) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    parse_mode: "Markdown"
  });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text
  });
}

module.exports = {
  SERVICE_CATEGORIES,
  answerCallbackQuery,
  buildCategoryKeyboard,
  buildMainMenuKeyboard,
  buildProviderDetailsKeyboard,
  buildProviderListKeyboard,
  sendMessage
};
