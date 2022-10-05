FROM node:latest

RUN mkdir /app

COPY index.js /app/
COPY creds.js /app/
COPY package.json /app/

WORKDIR /app

# https://dev.to/cloudx/how-to-use-puppeteer-inside-a-docker-container-568c
# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

# Install Google Chrome Stable and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer.
RUN apt-get update && apt-get install gnupg wget -y && \
    wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
    apt-get update && \
    apt-get install google-chrome-stable -y --no-install-recommends
    # rm -rf /var/lib/apt/lists/*

RUN npm install

EXPOSE 8080 9229/tcp 9229/udp

CMD ["node", "index.js"]
