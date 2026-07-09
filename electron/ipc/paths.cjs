const path = require("path");

function getIpcDir() {
  return "/tmp/rfx-ipc";
}

function getIpcPaths() {
  const dir = getIpcDir();
  return {
    dir,
    cmd: path.join(dir, "cmd.json"),
    cmdResult: path.join(dir, "cmd_result.json"),
    looperInputGain: path.join(dir, "looper_input_gain.json"),
    looperInputGainProcessing: path.join(dir, "looper_input_gain.processing.json"),
    vm: path.join(dir, "vm.json"),
    pluginlist: path.join(dir, "installed_plugins.json"),
    tuner: path.join(dir, "tuner.json"),
  };
}

module.exports = {
  getIpcDir,
  getIpcPaths,
};
