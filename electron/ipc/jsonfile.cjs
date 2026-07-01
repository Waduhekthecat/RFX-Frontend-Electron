const fs = require("fs");
const fsp = require("fs/promises");

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, data) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`;
  const tmp = `${filePath}.${suffix}.tmp`;
  const text = JSON.stringify(data, null, 2);
  try {
    await fsp.writeFile(tmp, text, "utf8");
    await fsp.rename(tmp, filePath);
  } catch (err) {
    try {
      await fsp.rm(tmp, { force: true });
    } catch {}
    throw err;
  }
}

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  ensureDir,
  readJsonSafe,
  writeJsonAtomic,
  exists,
};
