import * as fs from "node:fs";
import { exec } from "node:child_process";

function startDetachedTimer() {
  const args = process.argv.slice(2);
  const delayMs = parseInt(args[0], 10);
  const scriptPath = args[1];
  const pidFilePath = args[2];
  const scriptArgs = args.slice(3).join(" ");

  if (isNaN(delayMs) || !scriptPath || !pidFilePath) {
    console.error("Usage: tsx detached-timer.ts <delayMs> <scriptPath> <pidFilePath>");
    process.exit(1);
  }

  // Write our PID to the file
  fs.writeFileSync(pidFilePath, process.pid.toString(), "utf-8");

  // Wait for the specified delay
  setTimeout(() => {
    // Execute the script with forwarded arguments
    const cmd = scriptArgs ? `${scriptPath} ${scriptArgs}` : scriptPath;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing script: ${error.message}`);
      }
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      
      // Clean up PID file
      if (fs.existsSync(pidFilePath)) {
        fs.unlinkSync(pidFilePath);
      }
      process.exit(0);
    });
  }, delayMs);
}

startDetachedTimer();
