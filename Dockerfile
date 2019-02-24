FROM node:latest

# Create the directory
RUN mkdir -p /usr/src/calendarbot
WORKDIR /usr/src/calendarbot

# Copy and Install Bot
COPY package.json /usr/src/calendarbot
RUN npm install
COPY . /usr/src/calendarbot

# Run bot
CMD ["node", "bot.js"]