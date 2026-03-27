import { spawn } from "node:child_process";

const processes = [];

function run(label, args) {
  const child = spawn("npm", args, {
    cwd: process.cwd(),
    stdio: "pipe",
    shell: true,
    env: process.env,
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
    }
  });

  processes.push(child);
}

run("api", ["run", "dev", "--workspace", "@cvm/api"]);
run("web", ["run", "dev", "--workspace", "@cvm/web"]);

process.on("SIGINT", () => {
  for (const child of processes) {
    child.kill("SIGINT");
  }
  process.exit(0);
});

