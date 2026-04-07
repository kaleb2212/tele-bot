module.exports = async function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "telegram-service-marketplace-bot",
    timestamp: new Date().toISOString()
  });
};
