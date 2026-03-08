const path = require("path");

// const { app } = require("electron");
// function getIpcDir() {
//   return path.join(app.getPath("userData"), "rfx-ipc");
// }

function getIpcDir() {
  return "/tmp/rfx-ipc";
}

function getIpcPaths() {
  const dir = getIpcDir();
  return {
    dir,
    cmd: path.join(dir, "cmd.json"),
    cmdResult: path.join(dir, "cmd_result.json"),
    vm: path.join(dir, "vm.json"),
    pluginlist: path.join(dir, "installed_plugins.json"),
  };
}

module.exports = {
  getIpcDir,
  getIpcPaths,
};