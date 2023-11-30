import OpenAI from 'openai';
import { appendLog, createLogFolder, listAllFiles, parseSourceFolderArgument } from 'chatgpt4pcg-node';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const PHASE = 'final';
const CURRENT_STAGE = 'raw';
const CHARACTER_LIST = ['A', 'B', 'C', 'D', 'E', 'F', 'G',
  'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
  'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
const NUM_TRIALS = 10;
const OBJECT_TOKEN = '<OBJECT>';

function delay(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function main() {
  dotenv.config();

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let sourceFolder = '';

  try {
    sourceFolder = parseSourceFolderArgument();
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
    }
    return;
  }

  const outputDir = path.posix.join(sourceFolder, '..', 'competition');
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir);
  }

  const logFolderPath = await createLogFolder(outputDir);

  const promptsFiles = await listAllFiles(sourceFolder);

  if (promptsFiles.length === 0) {
    const log = `[${new Date().toISOString()}] Processing - No prompt files found.`;
    await appendLog(logFolderPath, CURRENT_STAGE, log);
    return;
  }

  promptsFiles.forEach(async (promptFile) => {
    const promptFilePath = path.posix.join(sourceFolder, promptFile);
    const fileContent = await fs.promises.readFile(promptFilePath, 'utf-8');

    if (fileContent.length === 0) {
      const log = `[${new Date().toISOString()}] Processing - team: ${promptFile} - error: empty file`;
      await appendLog(logFolderPath, CURRENT_STAGE, log);
      return;
    }

    const teamName = promptFile.split('.').slice(0, -1).join('.');
    const teamFolderPath = path.posix.join(outputDir, teamName);
    if (!fs.existsSync(teamFolderPath)) {
      await fs.promises.mkdir(teamFolderPath);
    }

    const stageFolderPath = path.posix.join(teamFolderPath, CURRENT_STAGE);
    if (!fs.existsSync(stageFolderPath)) {
      await fs.promises.mkdir(stageFolderPath);
    }

    const teamLog = `[${new Date().toISOString()}] Processing - team: ${teamName}`;
    await appendLog(logFolderPath, CURRENT_STAGE, teamLog);

    CHARACTER_LIST.forEach(async (character) => {
      const characterFolderPath = path.posix.join(stageFolderPath, character);
      if (!fs.existsSync(characterFolderPath)) {
        await fs.promises.mkdir(characterFolderPath);
      }

      const characterLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character}`;
      await appendLog(logFolderPath, CURRENT_STAGE, characterLog);

      const prompt = fileContent.replaceAll(OBJECT_TOKEN, `"${character}"`);

      await processTrials(openai, prompt, logFolderPath, teamName, character, characterFolderPath);
    });
  });

  await processDataCollection(openai, logFolderPath);
}

async function processTrials(openai: OpenAI, prompt: string, logFolderPath: string, teamName: string, character: string, characterFolderPath: string) {
  for (let i = 0; i < NUM_TRIALS; i++) {
    try {
      await prisma.promptRequest.create({
        data: {
          id: `${PHASE}_${teamName}_${character}_${i + 1}`,
          teamName,
          character,
          prompt,
          trial: i + 1,
          characterFolderPath,
        },
      });

      const trialLog = `[${new Date().toISOString()}] Saved to DB - team: ${teamName} - character: ${character} - trial: ${i + 1} - Success`;
      await appendLog(logFolderPath, CURRENT_STAGE, trialLog);
    } catch (e) {
      continue;
    }
  }
}

async function processDataCollection(openai: OpenAI, logFolderPath: string) {
  const promptRequests = await prisma.promptRequest.findMany({
    where: {
      isCompleted: false
    },
    take: 1
  });

  if (promptRequests.length !== 0) {
    await Promise.all(promptRequests.map(async (promptRequest: { id: string, teamName: string, character: string, prompt: string, trial: number, characterFolderPath: string }) => {
      const { id, teamName, character, prompt, trial, characterFolderPath } = promptRequest;
      try {
        await collectData(openai, prompt, characterFolderPath, logFolderPath, teamName, character, trial);
        delay(5000);
      } catch (e) {
      } finally {
        await prisma.promptRequest.update({
          where: {
            id
          },
          data: {
            isCompleted: true
          }
        });
      }
    }));
  }

  const completedRecordsCount = await prisma.promptRequest.count({
    where: { isCompleted: true },
  });

  const allRecordsCount = await prisma.promptRequest.count();

  const allRecordsCompleted = completedRecordsCount === allRecordsCount;

  if (!allRecordsCompleted) {
    await processDataCollection(openai, logFolderPath);
  }
}

async function collectData(openai: OpenAI, prompt: string, characterFolderPath: string, logFolderPath: string, teamName: string, character: string, trialNumber: number) {
  let response = '';
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: prompt,
      }],
    });
    response = chatCompletion.choices[0].message?.content?.toString() || '';

    if (response.length === 0) {
      const errorLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character} - trial: ${trialNumber} - error: empty response`;
      await appendLog(logFolderPath, CURRENT_STAGE, errorLog);
    }

    const trialLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character} - trial: ${trialNumber} - Success`;
    await appendLog(logFolderPath, CURRENT_STAGE, trialLog);

    const filePath = path.posix.join(characterFolderPath, `${teamName}_${character}_${trialNumber}.txt`);
    await fs.promises.writeFile(filePath, response);
  } catch (e) {
    const errorLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character} - trial: ${trialNumber} - error: ${e}`;
    await appendLog(logFolderPath, CURRENT_STAGE, errorLog);
    if (e!.toString().includes('500') || e!.toString().includes('501') || e!.toString().includes('502') || e!.toString().includes('503') || e!.toString().includes('504') || e!.toString().includes('getaddrinfo ENOTFOUND')) {
      delay(1000);
      await collectData(openai, prompt, characterFolderPath, logFolderPath, teamName, character, trialNumber);
    }
  }
}

main().then(async () => {
  await prisma.$disconnect();
})
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
