# safeBuy MCP server image. Build context = repo root:
#   docker build -f mcp/Dockerfile -t safebuy-mcp .
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY sdk ./sdk
COPY mcp ./mcp
ENV MCP_PORT=4030
EXPOSE 4030
CMD ["bun", "run", "mcp/server.ts"]
