// Connection URL is accepted only through hidden stdin, never command arguments.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const raw = await new Promise((resolve) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    value += chunk;
    if (value.includes("\n")) {
      process.stdin.pause();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      resolve(value);
    }
  });
});
const input = JSON.parse(raw);
process.env.DATABASE_URL = input.url;
process.env.ROOMIE_TEST_DB_HOST = new URL(input.url).hostname;
await import("./test-full-system.mjs");
