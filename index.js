require('dotenv').config();
const TelegramBot = require('./telegram-bot');
const SlackBot = require('./slack-bot');
const MappingService = require('./mapping-service');

// Initialize the mapping service
const mappingService = new MappingService();

// Initialize the bots
const telegramBot = new TelegramBot(mappingService);
const slackBot = new SlackBot(mappingService);

// Set up cross-references between bots
slackBot.setTelegramBot(telegramBot);

// Start both bots
telegramBot.start();
slackBot.start();

console.log('Cross-posting bot is running!');

// Handle application shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await telegramBot.stop();
  await slackBot.stop();
  process.exit(0);
});
