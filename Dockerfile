FROM node:22-bookworm-slim

WORKDIR /app

COPY . .

ENV NODE_ENV=production
ENV PORT=2930
ENV DATA_DIR=/app/data

EXPOSE 2930

CMD ["npm", "start"]
