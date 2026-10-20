import { writeFileSync } from "node:fs";
import { assess } from "../src/sim/report.ts";
import { sampleAt } from "../src/sim/physics.ts";

const report = assess();
const body = `${report.lines.join("\n")}\n`;
writeFileSync(new URL("../model-validation-Cursor.md", import.meta.url), body);
console.log(body);
if (!report.ok) {
  for (let t = 12; t <= 25; t += 0.2) {
    const frame = sampleAt(report.trajectory, t);
    console.log(
      t.toFixed(1),
      "comp",
      frame.specimenCompression.toFixed(3),
      "F",
      frame.force.toFixed(3),
      "q",
      frame.q.map((q) => q.toFixed(2)).join(" "),
      "qr",
      frame.qReset.toFixed(3),
    );
  }
}
if (!report.ok) {
  console.error(`Validation failed: ${report.checks.filter((check) => !check.ok).length} check(s).`);
  process.exit(1);
}
console.log("Validation passed.");
