const fs = require('fs');
const fsPromises = require('fs/promises');
const { existsSync } = fs;
//const path = require('path');

class MappingService {
  constructor() {
    this.mappingsFile = process.env.MAPPINGS_FILE || 'mappings.json';
    this.mappings = [];
    this.messageIdMappings = new Map(); // For tracking message IDs across platforms
    
    // Initialize asynchronously
    this.initialized = this.loadMappings().catch(err => {
      console.error('Failed to initialize MappingService:', err);
    });
  }

  async loadMappings() {
    try {
      if (existsSync(this.mappingsFile)) {
        const data = await fsPromises.readFile(this.mappingsFile, 'utf8');
        this.mappings = JSON.parse(data);
        console.log(`Loaded ${this.mappings.length} mappings from ${this.mappingsFile}`);
      } else {
        console.log(`No mappings file found at ${this.mappingsFile}. Starting with empty mappings.`);
        this.mappings = [];
        await this.saveMappings(); // Create an empty mappings file
      }
    } catch (error) {
      console.error('Error loading mappings:', error);
      this.mappings = [];
    }
  }

  async saveMappings() {
    try {
      await fsPromises.writeFile(this.mappingsFile, JSON.stringify(this.mappings, null, 2), 'utf8');
      console.log(`Saved ${this.mappings.length} mappings to ${this.mappingsFile}`);
    } catch (error) {
      console.error('Error saving mappings:', error);
    }
  }

  async getAllMappings() {
    // Ensure initialization is complete
    await this.initialized;
    return [...this.mappings];
  }

  async addMapping(telegramChannelId, slackChannelId) {
    // Ensure initialization is complete
    await this.initialized;
    
    // Check if mapping already exists
    const existingMapping = this.mappings.find(
      mapping => 
        mapping.telegramChannel === telegramChannelId && 
        mapping.slackChannel === slackChannelId
    );
    
    if (existingMapping) {
      throw new Error('This mapping already exists');
    }
    
    this.mappings.push({
      telegramChannel: telegramChannelId,
      slackChannel: slackChannelId
    });
    
    await this.saveMappings();
  }
  
  async createFile(fileName) {
    try {
      // Create the directory structure if it doesn't exist
      const dirName = require('path').dirname(fileName);
      if (dirName !== '.') {
        await fsPromises.mkdir(dirName, { recursive: true });
      }
      
      // Create an empty file
      await fsPromises.writeFile(fileName, '', { flag: 'wx' });
      console.log(`File created successfully: ${fileName}`);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        console.log(`File already exists: ${fileName}`);
        return false;
      } else {
        console.error(`Error creating file ${fileName}:`, error);
        throw error;
      }
    }
  }

  async removeMapping(telegramChannelId, slackChannelId) {
    // Ensure initialization is complete
    await this.initialized;
    
    const initialLength = this.mappings.length;
    
    this.mappings = this.mappings.filter(
      mapping => 
        !(mapping.telegramChannel === telegramChannelId && 
          mapping.slackChannel === slackChannelId)
    );
    
    if (this.mappings.length === initialLength) {
      throw new Error('Mapping not found');
    }
    
    await this.saveMappings();
  }

  async getSlackChannelForTelegramChannel(telegramChannelId) {
    // Ensure initialization is complete
    await this.initialized;
    const mapping = this.mappings.find(m => m.telegramChannel === telegramChannelId);
    return mapping ? mapping.slackChannel : null;
  }

  async getTelegramChannelForSlackChannel(slackChannelId) {
    // Ensure initialization is complete
    await this.initialized;
    const mapping = this.mappings.find(m => m.slackChannel === slackChannelId);
    return mapping ? mapping.telegramChannel : null;
  }

  // For tracking message IDs across platforms
  storeMessageMapping(messageMapping) {
    // Store by Telegram message ID for Telegram -> Slack lookups
    if (messageMapping.telegramChannelId && messageMapping.telegramMessageId) {
      const telegramKey = `telegram-${messageMapping.telegramChannelId}-${messageMapping.telegramMessageId}`;
      this.messageIdMappings.set(telegramKey, messageMapping);
    }
    
    // Store by Slack message TS for Slack -> Telegram lookups
    if (messageMapping.slackChannelId && messageMapping.slackMessageTs) {
      const slackKey = `slack-${messageMapping.slackChannelId}-${messageMapping.slackMessageTs}`;
      this.messageIdMappings.set(slackKey, messageMapping);
    }
  }
  
  getMessageMappingByTelegramMessage(telegramChannelId, telegramMessageId) {
    const key = `telegram-${telegramChannelId}-${telegramMessageId}`;
    return this.messageIdMappings.get(key);
  }
  
  getMessageMappingBySlackMessage(slackChannelId, slackMessageTs) {
    const key = `slack-${slackChannelId}-${slackMessageTs}`;
    return this.messageIdMappings.get(key);
  }

  getMessageMapping(telegramChannelId, telegramMessageId) {
    const key = `${telegramChannelId}-${telegramMessageId}`;
    return this.messageIdMappings.get(key);
  }
}

module.exports = MappingService;
