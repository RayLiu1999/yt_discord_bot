import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(__filename);

// 獲取檔案路徑
const filename = (path) => fileURLToPath(path);

// 獲取父目錄
const getParentDir = (currentDir, levelsUp) => {
  let resultDir = currentDir;
  for (let i = 0; i < levelsUp; i++) {
    resultDir = resolve(resultDir, '..');
  }
  return resultDir;
}

// 根目錄
const rootDir = getParentDir(__dirname, 1);

export { rootDir, dirname, filename, getParentDir };