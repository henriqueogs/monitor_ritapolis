# Site (Next.js). Usado pelo docker-compose.yml; produção roda na Vercel.
FROM node:24-slim

WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ARG NEXT_PUBLIC_MUNICIPIO=ritapolis
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MUNICIPIO=$NEXT_PUBLIC_MUNICIPIO \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
