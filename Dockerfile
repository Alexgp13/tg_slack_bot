FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Added volume for mappings.json persistence
VOLUME ["/mappings"]

# Set environment variables
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
