/**
 * Cleanup utility — deletes files older than X minutes
 * This ensures we NEVER permanently store user files (privacy-first)
 */
const fs = require('fs-extra');
const path = require('path');

function cleanupOldFiles(folderPath, maxAgeMinutes = 60) {
  if (!fs.existsSync(folderPath)) return;

  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  fs.readdir(folderPath, (err, files) => {
    if (err) return console.error('Cleanup read error:', err.message);

    files.forEach((file) => {
      const filePath = path.join(folderPath, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
          fs.remove(filePath, (err) => {
            if (!err) console.log(`🗑️  Cleaned up old file: ${file}`);
          });
        }
      });
    });
  });
}

module.exports = { cleanupOldFiles };
