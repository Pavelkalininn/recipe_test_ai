FROM node:20-alpine

WORKDIR /app

# Install canvas dependencies for icon generation
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

COPY package.json ./
RUN npm install --production
RUN npm install canvas

COPY generate-icons.js ./
COPY public/ ./public/

# Generate icons at build time
RUN node generate-icons.js

# Remove canvas (not needed at runtime)
RUN npm uninstall canvas && \
    apk del build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev pixman-dev pangomm-dev libjpeg-turbo-dev freetype-dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
