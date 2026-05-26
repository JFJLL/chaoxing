import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  SESSION_SECRET: process.env.SESSION_SECRET || "local-test-secret-for-yimei"
};

const commands = [
  ["npm", ["run", "clean"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:e2e"]]
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    env,
    shell: true,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
