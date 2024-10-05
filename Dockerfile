# Use Node.js LTS version as base image
FROM node:lts-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

# Install PM2
RUN npm i -g pm2

# Copy the rest of the application code
COPY . .

# Expose the application port
EXPOSE 3001

# Command to run the app
CMD ["pm2", "start", "ecosystem.config.js"]
