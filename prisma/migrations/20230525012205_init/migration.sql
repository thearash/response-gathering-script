-- CreateTable
CREATE TABLE "PromptRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamName" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "trial" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "characterFolderPath" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false
);
