const TelegramBot = require('node-telegram-bot-api');
const { WebClient } = require('@slack/web-api');

class TelegramBotHandler {
  constructor(mappingService) {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.bot = new TelegramBot(this.token, { polling: true });
    this.slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.mappingService = mappingService;
  }

  start() {
    console.log('Starting Telegram bot...');
    
    // Listen for messages from channels
    this.bot.on('channel_post', async (msg) => {
      try {
        await this.handleChannelMessage(msg);
      } catch (error) {
        console.error('Error handling Telegram channel message:', error);
      }
    });

    // Listen for updates to channel messages
    this.bot.on('edited_channel_post', async (msg) => {
      try {
        await this.handleEditedChannelMessage(msg);
      } catch (error) {
        console.error('Error handling edited Telegram channel message:', error);
      }
    });
  }

  async stop() {
    console.log('Stopping Telegram bot...');
    this.bot.stopPolling();
  }

  async handleChannelMessage(msg) {
    const telegramChannelId = msg.chat.id.toString();
    // Get mapped Slack channel
    const slackChannelId = this.mappingService.getSlackChannelForTelegramChannel(telegramChannelId);
    
    if (!slackChannelId) {
      return; // No mapping found for this channel
    }

    // Format the message for Slack
    let messageText = '';
    
    // Add sender information if available
    if (msg.chat.title) {
      messageText += `*From Telegram channel "${msg.chat.title}":*\n\n`;
    }
    
    // Add message text
    if (msg.text) {
      messageText += msg.text;
    }
    
    // Process media content if present
    if (msg.photo || msg.video || msg.document || msg.voice || msg.animation) {
      messageText += '\n\n_[Media content is present but cannot be directly embedded - check original channel]_';
    }

    // Check if this is a reply to another message
    let slackThreadTs = null;
    if (msg.reply_to_message) {
      const replyToId = msg.reply_to_message.message_id.toString();
      // Look up if the replied-to message was cross-posted to Slack
      const parentMapping = this.mappingService.getMessageMappingByTelegramMessage(
        telegramChannelId, 
        replyToId
      );
      
      if (parentMapping && parentMapping.slackMessageTs) {
        // If found, use the Slack thread_ts for threading
        slackThreadTs = parentMapping.slackMessageTs;
      }
    }
  
    // Prepare message options
    const messageOptions = {
      channel: slackChannelId,
      text: messageText,
      parse: 'full',
      unfurl_links: true
    };
    
    // Add thread_ts if this is a reply
    if (slackThreadTs) {
      messageOptions.thread_ts = slackThreadTs;
    }
  
    // Post message to Slack
    const result = await this.slackClient.chat.postMessage(messageOptions);
    
    // Store the mapping of message IDs for potential future edits and replies
    this.mappingService.storeMessageMapping({
      telegramChannelId,
      telegramMessageId: msg.message_id.toString(),
      slackChannelId,
      slackMessageTs: result.ts,
      // If this is a reply, store the parent message IDs
      parentTelegramMessageId: msg.reply_to_message ? msg.reply_to_message.message_id.toString() : null,
      parentSlackMessageTs: slackThreadTs
    });
  }

  async handleEditedChannelMessage(msg) {
    const telegramChannelId = msg.chat.id.toString();
    const telegramMessageId = msg.message_id.toString();
    
    // Get the message mapping
    const messageMapping = this.mappingService.getMessageMapping(telegramChannelId, telegramMessageId);
    
    if (!messageMapping || !messageMapping.slackMessageTs) {
      return; // No mapping found for this message or no Slack message TS stored
    }
    
    // Format the message for Slack
    let messageText = '';
    
    if (msg.chat.title) {
      messageText += `*From Telegram channel "${msg.chat.title}" (edited):*\n\n`;
    }
    
    if (msg.text) {
      messageText += msg.text;
    }
    
    // Update the message in Slack
    try {
      await this.slackClient.chat.update({
        channel: messageMapping.slackChannelId,
        ts: messageMapping.slackMessageTs,
        text: messageText,
        parse: 'full'
      });
    } catch (error) {
      console.error('Error updating Slack message:', error);
    }
  }

  // Method to send message to Telegram from Slack
  async sendMessageToTelegram(telegramChannelId, text, options = {}) {
    try {
      const sendOptions = {
        parse_mode: 'Markdown',
        ...options
      };

      return await this.bot.sendMessage(telegramChannelId, text, sendOptions);
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
      throw error;
    }
  }
}

module.exports = TelegramBotHandler;
