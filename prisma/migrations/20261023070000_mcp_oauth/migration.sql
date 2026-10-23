-- M3.4b (D-MCP): login OAuth do conector do Creator Club no Claude (só leitura).
-- CreateTable
CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpAuthCode_codeHash_key" ON "McpAuthCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

-- AddForeignKey
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas
ALTER TABLE "McpClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpAuthCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_kind" CHECK ("kind" IN ('ACCESS', 'REFRESH'));
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_s256" CHECK ("codeChallenge" ~ '^[A-Za-z0-9_-]{43}$');
