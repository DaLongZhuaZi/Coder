'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

function pathToFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

function openFileCommandForPlatform(filePath, platform) {
  return openFileCommandsForPlatform(filePath, platform)[0];
}

function openFileCommandsForPlatform(filePath, platform) {
  if (platform === 'win32') {
    return [
      {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'start', '""', pathToFileUrl(filePath)]
      }
    ];
  }
  if (platform === 'darwin') {
    return [
      {
        command: 'open',
        args: [filePath]
      }
    ];
  }
  return [
    {
      command: 'xdg-open',
      args: [filePath]
    },
    {
      command: 'gio',
      args: ['open', filePath]
    },
    {
      command: 'sensible-browser',
      args: [filePath]
    }
  ];
}

function openDetached(commands, index) {
  if (!Array.isArray(commands) || index >= commands.length) {
    return;
  }
  const launcher = commands[index];
  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  let fallbackStarted = false;
  const startFallback = () => {
    if (fallbackStarted) {
      return;
    }
    fallbackStarted = true;
    openDetached(commands, index + 1);
  };
  child.on('error', startFallback);
  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      startFallback();
    }
  });
  child.unref();
}

function openFile(filePath) {
  openDetached(openFileCommandsForPlatform(filePath, process.platform), 0);
}

module.exports = {
  openFile,
  openFileCommandForPlatform,
  openFileCommandsForPlatform,
  pathToFileUrl
};
