FROM node AS development

WORKDIR /usr/src/app

COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Install PM2
RUN npm i -g pm2

# Install NestJS CLI
RUN npm i -g @nestjs/cli 

COPY . .

FROM node AS production

WORKDIR /usr/src/app

ARG NODE_ENV=production

ENV NODE_ENV=${NODE_ENV}

COPY package*.json ./

RUN npm install --only=production

COPY . .

# Expose the application port
EXPOSE 3001

COPY --from=development /usr/src/app/dist ./dist

CMD ["pm2", "start", "ecosystem.config.js"]
