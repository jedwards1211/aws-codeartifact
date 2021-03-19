#!/usr/bin/env node

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs')
const readline = require('readline');
const package = require( process.cwd() + "/package.json" );

if (!package.config.awsCodeArtifact) {
    console.error('No awsCodeArtifact config found');
    process.exit(1);
}

const awsCodeArtifact = package.config.awsCodeArtifact;
const {domain: codeArtifactDomain, repository: codeArtifactRepository, scope: codeArtifactScope, accountId: codeArticactAccountId, region: codeArticactRegion} = awsCodeArtifact;

if (!codeArtifactDomain) {
  console.error('Missing domain config in awsCodeArtifact');
  process.exit(1);
}
if (!codeArtifactRepository) {
  console.error('Missing repository config in awsCodeArtifact');
  process.exit(1);
}

async function runShellCommand(command, mask='') {
  if (mask) {
    console.log(`running: ${command.replace(mask, '<masked>')}`);
  } else {
    console.log(`running: ${command}`);
  }

  try {
    const { stdout, stderr } = await exec(command);
    if (stdout) {
      console.log('stdout:', stdout);
    }
    if (stderr) {
      console.log('stderr:', stderr);
    }
  } catch (e) {
    console.error(e); // should contain code (exit code) and signal (that caused the termination).
    process.exit(1);
  }
}

async function processArg(arg) {
  console.log(`processing arg: ${arg}`)

  switch (arg) {
    case 'login':
      const namespaceString = codeArtifactScope ? `--namespace ${codeArtifactScope}` : ""
      await runShellCommand(`aws codeartifact login --tool npm ${namespaceString} --repository ${codeArtifactRepository} --domain ${codeArtifactDomain}`)
      break;

    // Uses CODEARTIFACT_AUTH_TOKEN if set otherwise tries to get it fron ~/.npmrc
    case 'npm-project-config':

      const registryWithoutProtocol = `//${codeArtifactDomain}-${codeArticactAccountId}.d.codeartifact.${codeArticactRegion}.amazonaws.com/npm/${codeArtifactRepository}/`;
      const registry = `https:${registryWithoutProtocol}`;

      if (codeArtifactScope) {
        await runShellCommand(`npm config set ${codeArtifactScope}:registry ${registry} --userconfig .npmrc`);
      } else {
        await runShellCommand(`npm config set registry ${registry} --userconfig .npmrc`);
      }

      await runShellCommand(`npm config set ${registryWithoutProtocol}:always-auth true --userconfig .npmrc`);

      if (process.env.CODEARTIFACT_AUTH_TOKEN) {
        await runShellCommand(`npm config set ${registryWithoutProtocol}:_authToken \${CODEARTIFACT_AUTH_TOKEN} --userconfig .npmrc`);
      } else {
        const home = process.env.HOME;
        const nodeRcFile=`${home}/.npmrc`;
        const rl = readline.createInterface({
          input: fs.createReadStream(nodeRcFile),
          output: process.stdout,
          terminal: false
        });

        let token='';
        const myReg = new RegExp(`^${registryWithoutProtocol}:_authToken=(.*)`);
        for await (const line of rl) {
          const myMatch = line.match(myReg)
          if (myMatch) {
            token = myMatch[1];
          }
        }

        if (token !== '') {
          await runShellCommand(`npm config set ${registryWithoutProtocol}:_authToken ${token} --userconfig .npmrc`, token);
        }

      }
      break;

    default:
      console.log(`Command not found: ${command}.`);
  }
}


const arg = process.argv[2] ? process.argv[2] : "default"
processArg(arg);
