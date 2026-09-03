# Node Alpine with libudev and image libs for escpos + USB
FROM node:20-alpine

# libudev.so.1 required by node_modules/usb for USB access
# and system libs needed to build node-canvas (used by escpos for images)
RUN apk add --no-cache \
  eudev-libs \
  build-base \
  cairo-dev pango-dev jpeg-dev giflib-dev

WORKDIR /app

ENV PRINT_PORT=3132
ENV PRINT_HOST=0.0.0.0
EXPOSE 3132

# Install dependencies (including canvas and escpos image deps)
COPY package*.json ./
RUN npm install

# Copy the rest of the print server source
COPY . .

CMD ["node", "server.js"]
