# Telegram-Slack Cross-Posting Bot

This bot allows cross-posting messages between Telegram channels and Slack channels. Messages from Telegram channels are forwarded to mapped Slack channels and vice versa.

## Features

- Two-way message forwarding between Telegram and Slack
- Admin interface in Slack to manage channel mappings
- Supports text messages
- Indicates when media content is present (though media is not directly transferred)
- Preserves message edits where possible
- Maintains conversation threading between platforms (replies in Telegram become threads in Slack and vice versa)

## Setup

### Prerequisites

- Node.js (v14 or newer)
- A Telegram Bot token (obtain from [@BotFather](https://t.me/botfather))
- A Slack App with the following:
  - Bot Token
  - Signing Secret
  - App-level Token (with socket mode enabled)

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your credentials:
   ```
   cp .env.example .env
   ```
4. Edit `.env` with your Telegram and Slack tokens
5. Configure admin users by adding their Slack user IDs to the `SLACK_ADMINS` setting in the `.env` file (comma-separated)
   - You can find a user's ID in Slack by viewing their profile and clicking the "..." menu, then "Copy member ID"
   - Only these users will be able to add or remove channel mappings

### Telegram Bot Setup

1. Create a new bot through [@BotFather](https://t.me/botfather)
2. Get the bot token and add it to your `.env` file
3. Add your bot to the Telegram channels you want to monitor
4. Make sure your bot has admin rights in those channels
5. Note the channel IDs for mapping configuration

### Slack App Setup

1. Create a new Slack App at [api.slack.com](https://api.slack.com/apps)
2. Under "OAuth & Permissions", add the following scopes:
   - `channels:history`
   - `channels:read` 
   - `chat:write`
   - `chat:write.public`
   - `commands`
   - `users:read`
   - `groups:history` (for private channels)
   - `threads:read` (for thread access)
   - `users:read.email` (helpful for identifying users for the admin list)
3. Install the app to your workspace
4. Create the following slash commands:
   - `/list-mappings` - Lists all channel mappings
   - `/add-mapping [Telegram Channel ID] [Slack Channel ID]` - Adds a new mapping
   - `/remove-mapping [Telegram Channel ID] [Slack Channel ID]` - Removes a mapping
5. Enable Socket Mode in your app settings
6. Get the Bot Token, Signing Secret, and App-level Token and add them to your `.env` file

## Usage

Start the bot:
