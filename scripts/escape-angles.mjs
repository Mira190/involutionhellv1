import { promises as fs } from "node:fs";
import fg from "fast-glob";
import { escapeSuspiciousAngles } from "../lib/escape-angles.ts";

const files = await fg(["content/docs/**/*.md"], { dot: false });

for (const file of files) {
  const src = await fs.readFile(file, "utf8");
  await fs.writeFile(file, escapeSuspiciousAngles(src), "utf8");
  console.log(`Escaped angles in ${file}`);
}
