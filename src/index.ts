import { Configuration, OpenAIApi } from 'openai'
import { appendLog, createLogFolder, listAllFiles, parseSourceFolderArgument } from 'chatgpt4pcg-node'

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const PHASE = 'midterm'
const CURRENT_STAGE = 'raw'
// const CHARACTER_LIST = ['A', 'B', 'C', 'D', 'E', 'F', 'G',
//   'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
//   'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
const CHARACTER_LIST = ['A', 'B', 'C']
// const NUM_TRIALS = 10
const NUM_TRIALS = 4
const OBJECT_TOKEN = '<OBJECT>'

async function main() {
  dotenv.config()

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const openai = new OpenAIApi(configuration)

  let sourceFolder = ''

  try {
    sourceFolder = parseSourceFolderArgument()
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message)
    }
    return
  }

  const outputDir = path.posix.join(sourceFolder, '..', 'competition')
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir)
  }

  const logFolderPath = await createLogFolder(outputDir)

  const promptsFiles = await listAllFiles(sourceFolder)

  if (promptsFiles.length === 0) {
    const log = `[${new Date().toISOString()}] Processing - No prompt files found.`
    await appendLog(logFolderPath, CURRENT_STAGE, log)
    return
  }

  promptsFiles.forEach(async (promptFile) => {
    const promptFilePath = path.posix.join(sourceFolder, promptFile)
    const fileContent = await fs.promises.readFile(promptFilePath, 'utf-8')

    if (fileContent.length === 0) {
      const log = `[${new Date().toISOString()}] Processing - team: ${promptFile} - error: empty file`
      await appendLog(logFolderPath, CURRENT_STAGE, log)
      return
    }

    const teamName = promptFile.split('.').slice(0, -1).join('.')
    const teamFolderPath = path.posix.join(outputDir, teamName)
    if (!fs.existsSync(teamFolderPath)) {
      await fs.promises.mkdir(teamFolderPath)
    }

    const stageFolderPath = path.posix.join(teamFolderPath, CURRENT_STAGE)
    if (!fs.existsSync(stageFolderPath)) {
      await fs.promises.mkdir(stageFolderPath)
    }

    const teamLog = `[${new Date().toISOString()}] Processing - team: ${teamName}`
    await appendLog(logFolderPath, CURRENT_STAGE, teamLog)

    CHARACTER_LIST.forEach(async (character) => {
      const characterFolderPath = path.posix.join(stageFolderPath, character)
      if (!fs.existsSync(characterFolderPath)) {
        await fs.promises.mkdir(characterFolderPath)
      }

      const characterLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character}`
      await appendLog(logFolderPath, CURRENT_STAGE, characterLog)

      const prompt = fileContent.replaceAll(OBJECT_TOKEN, `"${character}"`)

      await processTrials(prompt, logFolderPath, teamName, character, characterFolderPath)
    })
  })

  await processDataCollection(openai, logFolderPath)
}

async function processTrials(prompt: string, logFolderPath: string, teamName: string, character: string, characterFolderPath: string) {
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
      })

      const trialLog = `[${new Date().toISOString()}] Saved to DB - team: ${teamName} - character: ${character} - trial: ${i + 1} - Success`
      await appendLog(logFolderPath, CURRENT_STAGE, trialLog)
    } catch (e) {
      continue
    }
  }
}

const MAX_PARALLEL_REQUEST = 10
let count = 0
async function processDataCollection(openai: OpenAIApi, logFolderPath: string) {
  const promptRequests = await prisma.promptRequest.findMany({
    where: {
      isCompleted: false
    },
    take: MAX_PARALLEL_REQUEST - count
  })

  if (promptRequests.length !== 0) {
    count += promptRequests.length
    await Promise.all(promptRequests.map(async (promptRequest) => {
      const { id, teamName, character, prompt, trial, characterFolderPath } = promptRequest
      try {
        await collectData(openai, prompt, characterFolderPath, logFolderPath, teamName, character, trial)
      } catch (e) {
      } finally {
        count -= promptRequests.length
        await prisma.promptRequest.update({
          where: {
            id
          },
          data: {
            isCompleted: true
          }
        })
      }
    }))

    await processDataCollection(openai, logFolderPath)
  }
}

async function collectData(openai: OpenAIApi, prompt: string, characterFolderPath: string, logFolderPath: string, teamName: string, character: string, trialNumber: number) {
  let response = ''
  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{
        "role": "user", "content": prompt,
      }]
    })
    response = completion.data.choices[0].message?.content.toString() || ''
  } catch (e) {
    const errorLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character} - trial: ${trialNumber} - error: ${e}`
    await appendLog(logFolderPath, CURRENT_STAGE, errorLog)
  }

  if (response.length === 0) {
    const errorLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character} - trial: ${trialNumber} - error: empty response`
    await appendLog(logFolderPath, CURRENT_STAGE, errorLog)
  }

  const trialLog = `[${new Date().toISOString()}] Processing - team: ${teamName} - character: ${character} - trial: ${trialNumber} - Success`
  await appendLog(logFolderPath, CURRENT_STAGE, trialLog)

  const filePath = path.posix.join(characterFolderPath, `${teamName}_${character}_${trialNumber}.txt`)
  await fs.promises.writeFile(filePath, response)
}

main().then(async () => {
  await prisma.$disconnect()
})
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })