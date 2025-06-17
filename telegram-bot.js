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
    const { version } = require('./package.json');
    console.log(`Starting Telegram bot v${version}... API key: ${this.token}`);
    
    // Listen for messages from channels
    this.bot.on('message', async (msg) => {
      //console.log("Telegram channel message received: "+msg.chat.id+" / text:"+msg.text);
      try {
        await this.handleChannelMessage(msg);
      } catch (error) {
        console.error('Error handling Telegram channel message:', error);
      }
    });

    // Listen for updates to channel messages
    this.bot.on('edited_message', async (msg) => {
      //console.log("Telegram edited channel message received: "+msg.chat.id+" / text:"+msg.text);
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
    const slackChannelId = await this.mappingService.getSlackChannelForTelegramChannel(telegramChannelId);
    
    if (!slackChannelId) {
      console.log("No mapping found for Telegram channel "+telegramChannelId+" - ignoring message.")
      return; // No mapping found for this channel
    }
    else {
      //console.log("Mapping found for Telegram channel "+telegramChannelId+" - posting message to Slack channel "+slackChannelId+".")
    }

    // Format the message for Slack
    let messageText = '';
    
    // Add sender information if available
    if (msg.chat.title) {
      messageText += `From Telegram channel *"${msg.chat.title}":*\n\n`;
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
      messageText += `From Telegram channel *"${msg.chat.title}" (edited):*\n\n`;
    }
    
    if (msg.text) {
      messageText += msg.text;
      //console.log("Message from chat:"+msg.chat+" / text:"+msg.text);
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
      console.error('Error #148 updating Slack message:', error);
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
      console.error('Error #162 sending message to Telegram:', error);
      throw error;
    }
  }
}

module.exports = TelegramBotHandler;
