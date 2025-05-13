const { App } = require('@slack/bolt');
//const express = require('express');

class SlackBotHandler {
  constructor(mappingService) {
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN
    });
    
    this.mappingService = mappingService;
    this.telegramBot = null; // This will be set via setTelegramBot method
    
    // Parse admin user IDs from environment variable
    this.adminUsers = (process.env.SLACK_ADMINS || '').split(',').filter(id => id.trim() !== '');
    
    if (this.adminUsers.length === 0) {
      console.warn('Warning: No admin users defined in SLACK_ADMINS environment variable. Admin commands will be unavailable.');
    } else {
      console.log(`Admins configured: ${this.adminUsers.length} users`);
    }
  }

  setTelegramBot(telegramBot) {
    this.telegramBot = telegramBot;
  }
  
  isUserAdmin(userId) {
    return this.adminUsers.includes(userId);
  }

  start() {
    console.log('Starting Slack bot...');
    
    // Listen to messages in channels
    this.app.message(async ({ message, client }) => {
      try {
        // Ignore bot messages to prevent loops
        if (message.subtype === 'bot_message' || message.bot_id) {
          return;
        }
        
        await this.handleChannelMessage(message, client);
      } catch (error) {
        console.error('Error handling Slack message:', error);
      }
    });

    // Handle admin commands for channel mappings
    this.setupAdminCommands();
    
    // Start the Slack app
    (async () => {
      await this.app.start();
      console.log('⚡️ Slack Bolt app is running!');
    })();
  }

  async stop() {
    console.log('Stopping Slack bot...');
    await this.app.stop();
  }

  async handleChannelMessage(message, client) {
    const slackChannelId = message.channel;
    
    // Get mapped Telegram channel
    const telegramChannelId = this.mappingService.getTelegramChannelForSlackChannel(slackChannelId);
    
    if (!telegramChannelId || !this.telegramBot) {
      return; // No mapping found or telegram bot not set
    }

    // Format the message for Telegram
    let messageText = '';
    
    // Get channel and user info for better context
    try {
      const channelInfo = await client.conversations.info({ channel: slackChannelId });
      const userInfo = message.user ? await client.users.info({ user: message.user }) : null;
      
      if (channelInfo.channel && channelInfo.channel.name) {
        messageText += `*From Slack #${channelInfo.channel.name}*\n`;
      }
      
      if (userInfo && userInfo.user && userInfo.user.real_name) {
        messageText += `*${userInfo.user.real_name}*: `;
      }
    } catch (error) {
      console.error('Error fetching Slack channel or user info:', error);
    }
    
    // Add message text
    messageText += message.text || '';
    
    // Process attachments if present
    if (message.attachments && message.attachments.length > 0) {
      messageText += '\n\n_[Message contains attachments - check original channel]_';
    }

    // Check if this is a thread reply
    const isThreadReply = !!message.thread_ts && message.thread_ts !== message.ts;
    let replyToMessageId = null;
    
    if (isThreadReply) {
      // Look up the parent message's Telegram ID
      const parentMapping = this.mappingService.getMessageMappingBySlackMessage(
        slackChannelId,
        message.thread_ts
      );
      
      if (parentMapping && parentMapping.telegramMessageId) {
        replyToMessageId = parentMapping.telegramMessageId;
      }
    }
  
    // Prepare options for sending to Telegram
    const telegramOptions = {
      parse_mode: 'Markdown'
    };
    
    // If this is a thread reply and we found the parent message in Telegram, set it as a reply
    if (replyToMessageId) {
      telegramOptions.reply_to_message_id = replyToMessageId;
    }
  
    // Send message to Telegram
    const telegramMessage = await this.telegramBot.sendMessageToTelegram(
      telegramChannelId,
      messageText,
      telegramOptions
    );
    
    // Store message mapping with thread information
    this.mappingService.storeMessageMapping({
      slackChannelId,
      slackMessageTs: message.ts,
      telegramChannelId,
      telegramMessageId: telegramMessage.message_id.toString(),
      // If this is a thread reply, store the parent message IDs
      parentSlackMessageTs: isThreadReply ? message.thread_ts : null,
      parentTelegramMessageId: replyToMessageId
    });
  }

  setupAdminCommands() {
    // Command to list all mappings
    this.app.command('/list-mappings', async ({ack, respond }) => {
      // Since this is a read-only operation, we allow any user to view
      // current mappings, but we could restrict if needed
      await ack();
      
      const mappings = this.mappingService.getAllMappings();
      
      if (mappings.length === 0) {
        await respond('No channel mappings configured.');
        return;
      }
      
      let response = '*Current Channel Mappings:*\n\n';
      
      for (const mapping of mappings) {
        response += `• Telegram: \`${mapping.telegramChannel}\` ↔ Slack: \`${mapping.slackChannel}\`\n`;
      }
      
      await respond(response);
    });

    // Command to add a new mapping
    this.app.command('/add-mapping', async ({ command, ack, respond }) => {
      // Check if user has admin privileges
      if (!this.isUserAdmin(command.user_id)) {
        await ack({
          response_type: 'ephemeral',
          text: 'You do not have permission to add channel mappings. This action requires admin privileges.'
        });
        return;
      }
      
      await ack();
      
      const parts = command.text.split(' ');
      
      if (parts.length !== 2) {
        await respond('Usage: /add-mapping [Telegram Channel ID] [Slack Channel ID]');
        return;
      }
      
      const [telegramChannelId, slackChannelId] = parts;
      
      try {
        this.mappingService.addMapping(telegramChannelId, slackChannelId);
        await respond(`Mapping added: Telegram \`${telegramChannelId}\` ↔ Slack \`${slackChannelId}\``);
      } catch (error) {
        await respond(`Error adding mapping: ${error.message}`);
      }
    });

    // Command to remove a mapping
    this.app.command('/remove-mapping', async ({ command, ack, respond }) => {
      // Check if user has admin privileges
      if (!this.isUserAdmin(command.user_id)) {
        await ack({
          response_type: 'ephemeral',
          text: 'You do not have permission to remove channel mappings. This action requires admin privileges.'
        });
        return;
      }
      
      await ack();
      
      const parts = command.text.split(' ');
      
      if (parts.length !== 2) {
        await respond('Usage: /remove-mapping [Telegram Channel ID] [Slack Channel ID]');
        return;
      }
      
      const [telegramChannelId, slackChannelId] = parts;
      
      try {
        this.mappingService.removeMapping(telegramChannelId, slackChannelId);
        await respond(`Mapping removed: Telegram \`${telegramChannelId}\` ↔ Slack \`${slackChannelId}\``);
      } catch (error) {
        await respond(`Error removing mapping: ${error.message}`);
      }
    });
  }
}

module.exports = SlackBotHandler;
