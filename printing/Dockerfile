# Node Alpine with libudev and image libs for escpos + USB
FROM node:20-alpine

# libudev.so.1 required by node_modules/usb for USB access.
# canvas.node is dynamically linked; these libs must exist at runtime
# (libcairo.so.2, pango, libpng, libjpeg.so.8, giflib), not only at build time.
RUN apk add --no-cache \
  eudev-libs \
  build-base python3 pkgconf \
  cairo cairo-dev \
  pango pango-dev \
  libpng \
  libjpeg-turbo jpeg-dev \
  giflib giflib-dev \
  freetype glib pixman harfbuzz \
  fontconfig ttf-dejavu font-noto font-noto-arabic

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
