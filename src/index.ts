import { Configuration, OpenAIApi } from 'openai'
import { appendLog, createLogFolder, listAllFiles } from './file-utils';

import dotenv from 'dotenv'
import fs from 'fs'
import parseArgs from 'minimist'
import path from 'path'

dotenv.config()

const CHARACTER_LIST = ['A', 'B', 'C', 'D', 'E', 'F', 'G',
  'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
  'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
const NUM_TRIALS = 10
const OBJECT_TOKEN = '<OBJECT>'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const argv = process.platform === 'win32' ? args['_'] : args['s']
  if (argv === undefined) {
    throw Error('Insufficient parameters to work with.')
  }

  const sourceFolder = argv + '/'
  const sFolder = path.posix.resolve(sourceFolder)

  const outputDir = path.posix.join(sFolder, '..', 'competition')
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir)
  }

  const logFolderPath = await createLogFolder(outputDir)

  const promptsFiles = await listAllFiles(sFolder)
  for (const promptFile of promptsFiles) {
    const promptFilePath = path.posix.join(sFolder, promptFile)
    const fileContent = await fs.promises.readFile(promptFilePath, 'utf-8')

    const teamName = promptFile.split('.').slice(0, -1).join('.')
    const teamFolderPath = path.posix.join(outputDir, teamName)
    if (!fs.existsSync(teamFolderPath)) {
      await fs.promises.mkdir(teamFolderPath)
    }
    const teamLog = `[${new Date().toISOString().replaceAll(':', '_')}] Processing - team: ${teamName}`
    await appendLog(logFolderPath, teamLog)

    for (const character of CHARACTER_LIST) {
      const characterFolderPath = path.posix.join(teamFolderPath, character)
      if (!fs.existsSync(characterFolderPath)) {
        await fs.promises.mkdir(characterFolderPath)
      }

      const characterLog = `[${new Date().toISOString().replaceAll(':', '_')}] Processing - team: ${teamName} - character: ${character}`
      await appendLog(logFolderPath, characterLog)

      const prompt = fileContent.replaceAll(OBJECT_TOKEN, `"${character}"`)

      for (let i = 0; i < NUM_TRIALS; i++) {
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
          const errorLog = `[${new Date().toISOString().replaceAll(':', '_')}] Processing - team: ${teamName} - character: ${character} - trial: ${i + 1} - error: ${e}`
          await appendLog(logFolderPath, errorLog)
          continue
        }

        if (response.length === 0) {
          const errorLog = `[${new Date().toISOString().replaceAll(':', '_')}] Processing - team: ${teamName} - character: ${character} - trial: ${i + 1} - error: empty response`
          await appendLog(logFolderPath, errorLog)
          continue
        }

        const trialLog = `[${new Date().toISOString().replaceAll(':', '_')}] Processing - team: ${teamName} - character: ${character} - trial: ${i + 1} - Success`
        await appendLog(logFolderPath, trialLog)

        const filePath = path.posix.join(characterFolderPath, `${teamName}_${character}_${i + 1}.txt`)
        await fs.promises.writeFile(filePath, response)
      }
    }
  }
}
main()