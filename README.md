# Reponse Gathering Script

This repository contains a script for gathering responses from ChatGPT API and produce a file with the responses.

## Installation

To use this script, you must have <a href="https://nodejs.org/en/" target="_new">Node.js</a> and <a href="https://www.npmjs.com/" target="_new">npm</a> installed on your system.

1. Clone this repository to your local machine.
2. Navigate to the repository directory in your terminal.
3. Run `npm install` to install the necessary dependencies.
4. Copy `.env.example` to `.env` and fill in the `OPENAI_API_KEY` which can be obtained by following [this page](https://platform.openai.com/docs/api-reference/making-requests).

## Usage

1. Run the script using the command `npm start -s="<SOURCE_FOLDER>"`. For example, `npm start -s="./competition"`.
2. The script will output response files in `../<SOURCE_FOLDER>/competition/<TEAM_NAME>/raw/<CHARACTER>` folder. The file `response_log_<DATE_TIME>.txt` will be created in the `../<SOURCE_FOLDER>/competition/logs` folder.

Please ensure that the source folder contains only text files.

Please note that interacting with ChatGPT via API costs money. Please refer to [this page](https://openai.com/pricing) for more information.
